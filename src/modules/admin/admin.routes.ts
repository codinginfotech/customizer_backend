import { Router } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { ok } from '../../utils/respond';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { dec } from '../../utils/misc';
import { listAuditLogs } from '../../services/audit.service';
import { validate } from '../../middleware/validate.middleware';
import { z } from 'zod';
import { buildMeta } from '../../utils/respond';

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('ADMIN'));

/** Paginated admin action audit trail. */
adminRoutes.get(
  '/audit-logs',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  catchAsync(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await listAuditLogs(page, pageSize);
    ok(res, items, buildMeta(page, pageSize, total));
  }),
);

/** Dashboard stats. */
adminRoutes.get(
  '/stats',
  catchAsync(async (_req, res) => {
    const [users, products, designs, orders, revenueAgg, recentOrders] = await prisma.$transaction([
      prisma.user.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.design.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    ok(res, {
      users,
      products,
      designs,
      orders,
      revenue: dec(revenueAgg._sum.total),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: dec(o.total),
        createdAt: o.createdAt,
        user: o.user,
      })),
    });
  }),
);
