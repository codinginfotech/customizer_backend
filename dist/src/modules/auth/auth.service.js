"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
exports.toPublicUser = toPublicUser;
const apiError_1 = require("../../utils/apiError");
const password_1 = require("../../utils/password");
const jwt_1 = require("../../utils/jwt");
const auth_repository_1 = require("./auth.repository");
const logger_1 = require("../../config/logger");
const email_service_1 = require("../../services/email.service");
function toPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
    };
}
class AuthService {
    constructor(repo = auth_repository_1.authRepository) {
        this.repo = repo;
    }
    async issueTokens(user) {
        const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role);
        const refresh = (0, jwt_1.generateRefreshToken)();
        await this.repo.createRefreshToken(user.id, refresh.tokenHash, refresh.expiresAt);
        return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
    }
    async register(name, email, password) {
        const existing = await this.repo.findUserByEmail(email);
        if (existing)
            throw apiError_1.ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
        const passwordHash = await (0, password_1.hashPassword)(password);
        const user = await this.repo.createUser({ name, email, passwordHash });
        logger_1.logger.info('auth.registered', { userId: user.id });
        // Email verification architecture: issue a token and send via the
        // pluggable email service (console transport in development).
        const verify = (0, jwt_1.generateActionToken)(60 * 24);
        await this.repo.createActionToken(user.id, 'EMAIL_VERIFY', verify.tokenHash, verify.expiresAt);
        await email_service_1.emailService.sendEmailVerification(user.email, verify.token);
        const tokens = await this.issueTokens(user);
        return { user: toPublicUser(user), tokens };
    }
    async login(email, password) {
        const user = await this.repo.findUserByEmail(email);
        if (!user) {
            logger_1.logger.warn('auth.login_failed', { reason: 'unknown_email' });
            throw apiError_1.ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
        }
        const valid = await (0, password_1.verifyPassword)(password, user.passwordHash);
        if (!valid) {
            logger_1.logger.warn('auth.login_failed', { reason: 'bad_password', userId: user.id });
            throw apiError_1.ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
        }
        if (user.status !== 'ACTIVE') {
            throw apiError_1.ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
        }
        logger_1.logger.info('auth.login', { userId: user.id });
        const tokens = await this.issueTokens(user);
        return { user: toPublicUser(user), tokens };
    }
    /** Rotating refresh: the presented token is revoked and a new one issued. */
    async refresh(refreshToken) {
        const record = await this.repo.findRefreshToken((0, jwt_1.hashToken)(refreshToken));
        if (!record || record.revokedAt || record.expiresAt < new Date()) {
            throw apiError_1.ApiError.unauthorized('Session expired, please sign in again', 'REFRESH_INVALID');
        }
        if (record.user.status !== 'ACTIVE') {
            throw apiError_1.ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
        }
        await this.repo.revokeRefreshToken(record.tokenHash);
        const tokens = await this.issueTokens(record.user);
        return { user: toPublicUser(record.user), tokens };
    }
    async logout(refreshToken) {
        if (refreshToken) {
            await this.repo.revokeRefreshToken((0, jwt_1.hashToken)(refreshToken));
        }
    }
    async me(userId) {
        const user = await this.repo.findUserById(userId);
        if (!user)
            throw apiError_1.ApiError.notFound('User not found', 'USER_NOT_FOUND');
        return toPublicUser(user);
    }
    async forgotPassword(email) {
        const user = await this.repo.findUserByEmail(email);
        // Always succeed to avoid account enumeration.
        if (!user)
            return;
        const reset = (0, jwt_1.generateActionToken)(30);
        await this.repo.createActionToken(user.id, 'PASSWORD_RESET', reset.tokenHash, reset.expiresAt);
        await email_service_1.emailService.sendPasswordReset(user.email, reset.token);
        logger_1.logger.info('auth.password_reset_requested', { userId: user.id });
    }
    async resetPassword(token, newPassword) {
        const record = await this.repo.findActionToken((0, jwt_1.hashToken)(token), 'PASSWORD_RESET');
        if (!record) {
            throw apiError_1.ApiError.badRequest('Reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
        }
        const passwordHash = await (0, password_1.hashPassword)(newPassword);
        await this.repo.updatePassword(record.userId, passwordHash);
        await this.repo.consumeActionToken(record.id);
        // Invalidate every session after a password change.
        await this.repo.revokeAllUserTokens(record.userId);
        logger_1.logger.info('auth.password_reset_completed', { userId: record.userId });
    }
    async verifyEmail(token) {
        const record = await this.repo.findActionToken((0, jwt_1.hashToken)(token), 'EMAIL_VERIFY');
        if (!record) {
            throw apiError_1.ApiError.badRequest('Verification link is invalid or has expired', 'VERIFY_TOKEN_INVALID');
        }
        await this.repo.markEmailVerified(record.userId);
        await this.repo.consumeActionToken(record.id);
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map