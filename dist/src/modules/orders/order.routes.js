"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const order_service_1 = require("./order.service");
const audit_service_1 = require("../../services/audit.service");
const export_service_1 = require("../export/export.service");
const shippingAddressSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(120),
    line1: zod_1.z.string().min(3).max(200),
    line2: zod_1.z.string().max(200).optional(),
    city: zod_1.z.string().min(1).max(100),
    state: zod_1.z.string().min(1).max(100),
    postalCode: zod_1.z.string().min(2).max(20),
    country: zod_1.z.string().min(2).max(80),
    phone: zod_1.z.string().max(30).optional(),
});
const createOrderSchema = zod_1.z.object({ shippingAddress: shippingAddressSchema });
const idParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
exports.orderRoutes = (0, express_1.Router)();
exports.orderRoutes.use(auth_middleware_1.requireAuth);
exports.orderRoutes.post('/', (0, validate_middleware_1.validate)({ body: createOrderSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await order_service_1.orderService.createFromCart(req.user.id, req.body.shippingAddress));
}));
exports.orderRoutes.get('/', (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await order_service_1.orderService.listForUser(req.user.id));
}));
// Admin listing — before /:id so "admin" isn't parsed as an id.
exports.orderRoutes.get('/admin/all', (0, auth_middleware_1.requireRole)('ADMIN'), (0, validate_middleware_1.validate)({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().min(1).default(1),
        pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
        status: zod_1.z
            .enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
            .optional(),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await order_service_1.orderService.listAll(page, pageSize, req.query.status);
    (0, respond_1.ok)(res, items, (0, respond_1.buildMeta)(page, pageSize, total));
}));
exports.orderRoutes.get('/:id', (0, validate_middleware_1.validate)({ params: idParam }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await order_service_1.orderService.getForUser(Number(req.params.id), req.user.id, req.user.role === 'ADMIN'));
}));
exports.orderRoutes.put('/:id/status', (0, auth_middleware_1.requireRole)('ADMIN'), (0, validate_middleware_1.validate)({
    params: idParam,
    body: zod_1.z.object({
        status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const order = await order_service_1.orderService.updateStatus(Number(req.params.id), req.body.status);
    void (0, audit_service_1.audit)(req.user.id, 'order.status_changed', 'order', order.id, { status: req.body.status });
    (0, respond_1.ok)(res, order);
}));
/** Production files for an ordered item — renders the frozen snapshot. */
exports.orderRoutes.get('/:id/items/:itemId/production', (0, validate_middleware_1.validate)({
    params: zod_1.z.object({
        id: zod_1.z.coerce.number().int().positive(),
        itemId: zod_1.z.coerce.number().int().positive(),
    }),
    query: zod_1.z.object({
        areaKey: zod_1.z.string().max(64).optional(),
        dpi: zod_1.z.coerce.number().int().min(72).max(600).default(300),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const item = await order_service_1.orderService.getItemSnapshot(Number(req.params.id), Number(req.params.itemId), req.user.id, req.user.role === 'ADMIN');
    if (!item.designSnapshot) {
        res.status(404).json({ success: false, message: 'This item has no design', code: 'NO_DESIGN' });
        return;
    }
    const png = await export_service_1.exportService.renderProductionFile(item.designSnapshot, item.productId, String(req.query.areaKey || ''), Number(req.query.dpi));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="order-item-${item.id}-${req.query.areaKey || 'area'}.png"`);
    res.send(png);
}));
//# sourceMappingURL=order.routes.js.map