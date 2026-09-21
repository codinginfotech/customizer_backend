"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const prisma_1 = require("../../lib/prisma");
const misc_1 = require("../../utils/misc");
const audit_service_1 = require("../../services/audit.service");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const zod_1 = require("zod");
const respond_2 = require("../../utils/respond");
exports.adminRoutes = (0, express_1.Router)();
exports.adminRoutes.use(auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)('ADMIN'));
/** Paginated admin action audit trail. */
exports.adminRoutes.get('/audit-logs', (0, validate_middleware_1.validate)({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().min(1).default(1),
        pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(30),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await (0, audit_service_1.listAuditLogs)(page, pageSize);
    (0, respond_1.ok)(res, items, (0, respond_2.buildMeta)(page, pageSize, total));
}));
/** Dashboard stats. */
exports.adminRoutes.get('/stats', (0, catchAsync_1.catchAsync)(async (_req, res) => {
    const [users, products, designs, orders, revenueAgg, recentOrders] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.count(),
        prisma_1.prisma.product.count({ where: { status: 'ACTIVE' } }),
        prisma_1.prisma.design.count(),
        prisma_1.prisma.order.count(),
        prisma_1.prisma.order.aggregate({
            _sum: { total: true },
            where: { status: { not: 'CANCELLED' } },
        }),
        prisma_1.prisma.order.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: { user: { select: { name: true, email: true } } },
        }),
    ]);
    (0, respond_1.ok)(res, {
        users,
        products,
        designs,
        orders,
        revenue: (0, misc_1.dec)(revenueAgg._sum.total),
        recentOrders: recentOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            total: (0, misc_1.dec)(o.total),
            createdAt: o.createdAt,
            user: o.user,
        })),
    });
}));
//# sourceMappingURL=admin.routes.js.map