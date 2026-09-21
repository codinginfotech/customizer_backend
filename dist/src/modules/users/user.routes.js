"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const password_1 = require("../../utils/password");
const logger_1 = require("../../config/logger");
const audit_service_1 = require("../../services/audit.service");
exports.userRoutes = (0, express_1.Router)();
exports.userRoutes.use(auth_middleware_1.requireAuth);
const publicUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    emailVerified: true,
    createdAt: true,
    _count: { select: { designs: true, orders: true } },
};
/** Update own profile. */
exports.userRoutes.put('/me', (0, validate_middleware_1.validate)({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2).max(120).optional(),
        currentPassword: zod_1.z.string().max(128).optional(),
        newPassword: zod_1.z
            .string()
            .min(8)
            .max(128)
            .regex(/[a-zA-Z]/)
            .regex(/[0-9]/)
            .optional(),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        throw apiError_1.ApiError.notFound('User not found', 'USER_NOT_FOUND');
    let passwordHash;
    if (req.body.newPassword) {
        if (!req.body.currentPassword) {
            throw apiError_1.ApiError.badRequest('Current password is required', 'CURRENT_PASSWORD_REQUIRED');
        }
        const valid = await (0, password_1.verifyPassword)(req.body.currentPassword, user.passwordHash);
        if (!valid)
            throw apiError_1.ApiError.badRequest('Current password is incorrect', 'INVALID_CREDENTIALS');
        passwordHash = await (0, password_1.hashPassword)(req.body.newPassword);
    }
    const updated = await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: {
            ...(req.body.name ? { name: req.body.name } : {}),
            ...(passwordHash ? { passwordHash } : {}),
        },
        select: publicUserSelect,
    });
    (0, respond_1.ok)(res, updated);
}));
// ---- admin ----
exports.userRoutes.get('/', (0, auth_middleware_1.requireRole)('ADMIN'), (0, validate_middleware_1.validate)({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().min(1).default(1),
        pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
        search: zod_1.z.string().max(190).optional(),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
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
    const [items, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: publicUserSelect,
        }),
        prisma_1.prisma.user.count({ where }),
    ]);
    (0, respond_1.ok)(res, items, (0, respond_1.buildMeta)(page, pageSize, total));
}));
exports.userRoutes.put('/:id', (0, auth_middleware_1.requireRole)('ADMIN'), (0, validate_middleware_1.validate)({
    params: zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() }),
    body: zod_1.z.object({
        role: zod_1.z.enum(['USER', 'ADMIN']).optional(),
        status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id && req.body.status === 'INACTIVE') {
        throw apiError_1.ApiError.badRequest('You cannot disable your own account', 'CANNOT_DISABLE_SELF');
    }
    const updated = await prisma_1.prisma.user.update({
        where: { id: targetId },
        data: req.body,
        select: publicUserSelect,
    });
    if (req.body.status === 'INACTIVE') {
        await prisma_1.prisma.refreshToken.updateMany({
            where: { userId: targetId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
    logger_1.logger.info('admin.user_updated', { targetId, by: req.user.id });
    void (0, audit_service_1.audit)(req.user.id, 'user.updated', 'user', targetId, req.body);
    (0, respond_1.ok)(res, updated);
}));
//# sourceMappingURL=user.routes.js.map