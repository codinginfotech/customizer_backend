"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const shared_1 = require("@cpd/shared");
const prisma_1 = require("../../lib/prisma");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const apiError_1 = require("../../utils/apiError");
const templateJsonSchema = zod_1.z.object({
    canvas: zod_1.z.object({
        width: zod_1.z.number().int().min(50).max(4000),
        height: zod_1.z.number().int().min(50).max(4000),
    }),
    elements: zod_1.z.array(shared_1.designElementSchema).min(1).max(100),
});
const createTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(160),
    category: zod_1.z.string().min(1).max(80),
    templateJson: templateJsonSchema,
    previewImage: zod_1.z.string().max(500).nullable().optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
const idParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
exports.templateRoutes = (0, express_1.Router)();
/** Public: browse active templates, optionally by category. */
exports.templateRoutes.get('/', (0, validate_middleware_1.validate)({ query: zod_1.z.object({ category: zod_1.z.string().max(80).optional() }) }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const templates = await prisma_1.prisma.designTemplate.findMany({
        where: {
            status: 'ACTIVE',
            ...(req.query.category ? { category: String(req.query.category) } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    (0, respond_1.ok)(res, templates);
}));
exports.templateRoutes.get('/categories', (0, catchAsync_1.catchAsync)(async (_req, res) => {
    const rows = await prisma_1.prisma.designTemplate.groupBy({
        by: ['category'],
        where: { status: 'ACTIVE' },
        _count: true,
    });
    (0, respond_1.ok)(res, rows.map((r) => ({ category: r.category, count: r._count })));
}));
const admin = [auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)('ADMIN')];
exports.templateRoutes.get('/all', ...admin, (0, catchAsync_1.catchAsync)(async (_req, res) => {
    (0, respond_1.ok)(res, await prisma_1.prisma.designTemplate.findMany({ orderBy: { createdAt: 'desc' } }));
}));
exports.templateRoutes.post('/', ...admin, (0, validate_middleware_1.validate)({ body: createTemplateSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const t = await prisma_1.prisma.designTemplate.create({
        data: {
            name: req.body.name,
            category: req.body.category,
            templateJson: req.body.templateJson,
            previewImage: req.body.previewImage ?? null,
            status: req.body.status,
        },
    });
    (0, respond_1.created)(res, t);
}));
exports.templateRoutes.put('/:id', ...admin, (0, validate_middleware_1.validate)({ params: idParam, body: createTemplateSchema.partial() }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const existing = await prisma_1.prisma.designTemplate.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing)
        throw apiError_1.ApiError.notFound('Template not found', 'TEMPLATE_NOT_FOUND');
    const t = await prisma_1.prisma.designTemplate.update({
        where: { id: existing.id },
        data: {
            ...(req.body.name !== undefined ? { name: req.body.name } : {}),
            ...(req.body.category !== undefined ? { category: req.body.category } : {}),
            ...(req.body.templateJson !== undefined
                ? { templateJson: req.body.templateJson }
                : {}),
            ...(req.body.previewImage !== undefined ? { previewImage: req.body.previewImage } : {}),
            ...(req.body.status !== undefined ? { status: req.body.status } : {}),
        },
    });
    (0, respond_1.ok)(res, t);
}));
exports.templateRoutes.delete('/:id', ...admin, (0, validate_middleware_1.validate)({ params: idParam }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await prisma_1.prisma.designTemplate.delete({ where: { id: Number(req.params.id) } });
    (0, respond_1.noContent)(res);
}));
//# sourceMappingURL=template.routes.js.map