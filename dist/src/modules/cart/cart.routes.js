"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const cart_service_1 = require("./cart.service");
const addItemSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    variantId: zod_1.z.number().int().positive().nullable().optional(),
    designId: zod_1.z.number().int().positive().nullable().optional(),
    quantity: zod_1.z.number().int().min(1).max(10000).default(1),
});
const updateItemSchema = zod_1.z.object({ quantity: zod_1.z.number().int().min(1).max(10000) });
const idParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
exports.cartRoutes = (0, express_1.Router)();
exports.cartRoutes.use(auth_middleware_1.requireAuth);
exports.cartRoutes.get('/', (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await cart_service_1.cartService.getCart(req.user.id));
}));
exports.cartRoutes.post('/items', (0, validate_middleware_1.validate)({ body: addItemSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await cart_service_1.cartService.addItem(req.user.id, req.body));
}));
exports.cartRoutes.put('/items/:id', (0, validate_middleware_1.validate)({ params: idParam, body: updateItemSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await cart_service_1.cartService.updateItem(req.user.id, Number(req.params.id), req.body.quantity));
}));
exports.cartRoutes.delete('/items/:id', (0, validate_middleware_1.validate)({ params: idParam }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await cart_service_1.cartService.removeItem(req.user.id, Number(req.params.id)));
}));
exports.cartRoutes.delete('/', (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await cart_service_1.cartService.clear(req.user.id));
}));
//# sourceMappingURL=cart.routes.js.map