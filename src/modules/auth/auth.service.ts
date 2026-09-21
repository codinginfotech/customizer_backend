import crypto from 'crypto';
import { User } from '@prisma/client';
import { ApiError } from '../../utils/apiError';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  generateActionToken,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from '../../utils/jwt';
import { authRepository, AuthRepository } from './auth.repository';
import { logger } from '../../config/logger';
import { emailService } from '../../services/email.service';
import { IdTokenVerifier, verifyFirebaseIdToken } from '../../lib/firebaseAdmin';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
export type PublicUser = ReturnType<typeof toPublicUser>;

export class AuthService {
  constructor(
    private readonly repo: AuthRepository = authRepository,
    private readonly verifyIdToken: IdTokenVerifier = verifyFirebaseIdToken,
  ) {}

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = signAccessToken(user.id, user.role);
    const refresh = generateRefreshToken();
    await this.repo.createRefreshToken(user.id, refresh.tokenHash, refresh.expiresAt);
    return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  }

  async register(name: string, email: string, password: string) {
    const existing = await this.repo.findUserByEmail(email);
    if (existing) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(password);
    const user = await this.repo.createUser({ name, email, passwordHash });
    logger.info('auth.registered', { userId: user.id });

    // Email verification architecture: issue a token and send via the
    // pluggable email service (console transport in development).
    const verify = generateActionToken(60 * 24);
    await this.repo.createActionToken(user.id, 'EMAIL_VERIFY', verify.tokenHash, verify.expiresAt);
    await emailService.sendEmailVerification(user.email, verify.token);

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async login(email: string, password: string) {
    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      logger.warn('auth.login_failed', { reason: 'unknown_email' });
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      logger.warn('auth.login_failed', { reason: 'bad_password', userId: user.id });
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
    }
    logger.info('auth.login', { userId: user.id });
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Google sign-in. Firebase has already authenticated the person; we verify
   * its ID token, then link by email: an existing account signs in, a new
   * email gets an account. Accounts created this way carry an unguessable
   * random password, so the only ways in are Google or a password reset.
   */
  async loginWithGoogle(idToken: string) {
    const identity = await this.verifyIdToken(idToken);
    // Never link to an existing account on an unverified address — that is
    // the classic OAuth account-takeover vector.
    if (!identity.emailVerified) {
      throw ApiError.forbidden('Your Google email address is not verified', 'GOOGLE_EMAIL_UNVERIFIED');
    }

    let user = await this.repo.findUserByEmail(identity.email);
    if (user) {
      if (user.status !== 'ACTIVE') {
        throw ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
      }
      if (!user.emailVerified) {
        user = await this.repo.markEmailVerified(user.id);
      }
      logger.info('auth.login', { userId: user.id, provider: 'google' });
    } else {
      const name = (identity.name ?? identity.email.split('@')[0]).slice(0, 120);
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
      user = await this.repo.createUser({
        name,
        email: identity.email,
        passwordHash,
        emailVerified: true,
      });
      logger.info('auth.registered', { userId: user.id, provider: 'google' });
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /** Rotating refresh: the presented token is revoked and a new one issued. */
  async refresh(refreshToken: string) {
    const record = await this.repo.findRefreshToken(hashToken(refreshToken));
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw ApiError.unauthorized('Session expired, please sign in again', 'REFRESH_INVALID');
    }
    if (record.user.status !== 'ACTIVE') {
      throw ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
    }
    await this.repo.revokeRefreshToken(record.tokenHash);
    const tokens = await this.issueTokens(record.user);
    return { user: toPublicUser(record.user), tokens };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.repo.revokeRefreshToken(hashToken(refreshToken));
    }
  }

  async me(userId: number) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return toPublicUser(user);
  }

  async forgotPassword(email: string) {
    const user = await this.repo.findUserByEmail(email);
    // Always succeed to avoid account enumeration.
    if (!user) return;
    const reset = generateActionToken(30);
    await this.repo.createActionToken(user.id, 'PASSWORD_RESET', reset.tokenHash, reset.expiresAt);
    await emailService.sendPasswordReset(user.email, reset.token);
    logger.info('auth.password_reset_requested', { userId: user.id });
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.repo.findActionToken(hashToken(token), 'PASSWORD_RESET');
    if (!record) {
      throw ApiError.badRequest('Reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.repo.updatePassword(record.userId, passwordHash);
    await this.repo.consumeActionToken(record.id);
    // Invalidate every session after a password change.
    await this.repo.revokeAllUserTokens(record.userId);
    logger.info('auth.password_reset_completed', { userId: record.userId });
  }

  async verifyEmail(token: string) {
    const record = await this.repo.findActionToken(hashToken(token), 'EMAIL_VERIFY');
    if (!record) {
      throw ApiError.badRequest('Verification link is invalid or has expired', 'VERIFY_TOKEN_INVALID');
    }
    await this.repo.markEmailVerified(record.userId);
    await this.repo.consumeActionToken(record.id);
  }
}

export const authService = new AuthService();
