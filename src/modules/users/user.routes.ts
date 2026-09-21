import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../utils/catchAsync';
import { ok, buildMeta } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { hashPassword, verifyPassword } from '../../utils/password';
import { logger } from '../../config/logger';
import { audit } from '../../services/audit.service';

export const userRoutes = Router();
userRoutes.use(requireAuth);

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  _count: { select: { designs: true, orders: true } },
} as const;

/** Update own profile. */
userRoutes.put(
  '/me',
  validate({
    body: z.object({
      name: z.string().min(2).max(120).optional(),
      currentPassword: z.string().max(128).optional(),
      newPassword: z
        .string()
        .min(8)
        .max(128)
        .regex(/[a-zA-Z]/)
        .regex(/[0-9]/)
        .optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    let passwordHash: string | undefined;
    if (req.body.newPassword) {
      if (!req.body.currentPassword) {
        throw ApiError.badRequest('Current password is required', 'CURRENT_PASSWORD_REQUIRED');
      }
      const valid = await verifyPassword(req.body.currentPassword, user.passwordHash);
      if (!valid) throw ApiError.badRequest('Current password is incorrect', 'INVALID_CREDENTIALS');
      passwordHash = await hashPassword(req.body.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: publicUserSelect,
    });
    ok(res, updated);
  }),
);

// ---- admin ----
userRoutes.get(
  '/',
  requireRole('ADMIN'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().max(190).optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const where = req.query.search
      ? {
          OR: [
            { name: { contains: String(req.query.search) } },
            { email: { contains: String(req.query.search) } },
          ],
        }
      : {};
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: publicUserSelect,
      }),
      prisma.user.count({ where }),
    ]);
    ok(res, items, buildMeta(page, pageSize, total));
  }),
);

userRoutes.put(
  '/:id',
  requireRole('ADMIN'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      role: z.enum(['USER', 'ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user!.id && req.body.status === 'INACTIVE') {
      throw ApiError.badRequest('You cannot disable your own account', 'CANNOT_DISABLE_SELF');
    }
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: req.body,
      select: publicUserSelect,
    });
    if (req.body.status === 'INACTIVE') {
      await prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    logger.info('admin.user_updated', { targetId, by: req.user!.id });
    void audit(req.user!.id, 'user.updated', 'user', targetId, req.body);
    ok(res, updated);
  }),
);
