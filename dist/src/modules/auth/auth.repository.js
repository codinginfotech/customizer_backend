"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRepository = void 0;
const prisma_1 = require("../../lib/prisma");
exports.authRepository = {
    findUserByEmail(email) {
        return prisma_1.prisma.user.findUnique({ where: { email } });
    },
    findUserById(id) {
        return prisma_1.prisma.user.findUnique({ where: { id } });
    },
    createUser(data) {
        return prisma_1.prisma.user.create({ data });
    },
    updatePassword(userId, passwordHash) {
        return prisma_1.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    },
    markEmailVerified(userId) {
        return prisma_1.prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    },
    // --- refresh tokens ---
    createRefreshToken(userId, tokenHash, expiresAt) {
        return prisma_1.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
    },
    findRefreshToken(tokenHash) {
        return prisma_1.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    },
    revokeRefreshToken(tokenHash) {
        return prisma_1.prisma.refreshToken.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    },
    revokeAllUserTokens(userId) {
        return prisma_1.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    },
    // --- action tokens (password reset / email verify) ---
    createActionToken(userId, type, tokenHash, expiresAt) {
        return prisma_1.prisma.actionToken.create({ data: { userId, type, tokenHash, expiresAt } });
    },
    findActionToken(tokenHash, type) {
        return prisma_1.prisma.actionToken.findFirst({
            where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
        });
    },
    consumeActionToken(id) {
        return prisma_1.prisma.actionToken.update({ where: { id }, data: { usedAt: new Date() } });
    },
};
//# sourceMappingURL=auth.repository.js.map