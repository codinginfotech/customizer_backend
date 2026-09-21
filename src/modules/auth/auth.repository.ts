import { Prisma, TokenType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  updatePassword(userId: number, passwordHash: string) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  markEmailVerified(userId: number) {
    return prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
  },

  // --- refresh tokens ---
  createRefreshToken(userId: number, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllUserTokens(userId: number) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  // --- action tokens (password reset / email verify) ---
  createActionToken(userId: number, type: TokenType, tokenHash: string, expiresAt: Date) {
    return prisma.actionToken.create({ data: { userId, type, tokenHash, expiresAt } });
  },

  findActionToken(tokenHash: string, type: TokenType) {
    return prisma.actionToken.findFirst({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  consumeActionToken(id: number) {
    return prisma.actionToken.update({ where: { id }, data: { usedAt: new Date() } });
  },
};

export type AuthRepository = typeof authRepository;
