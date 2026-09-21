import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: number;
  role: Role;
  type: 'access';
}

export function signAccessToken(userId: number, role: Role): string {
  const payload: AccessTokenPayload = { sub: userId, role, type: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  if (decoded.type !== 'access') throw new Error('Invalid token type');
  return { sub: Number(decoded.sub), role: decoded.role as Role, type: 'access' };
}

/**
 * Refresh tokens are opaque random strings. Only a SHA-256 hash is stored in
 * the database, so a database leak cannot be replayed as valid tokens.
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Random tokens for password reset / email verification links. */
export function generateActionToken(ttlMinutes: number): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
  };
}
