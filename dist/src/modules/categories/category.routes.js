"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryRoutes = void 0;
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const category_service_1 = require("./category.service");
const category_validators_1 = require("./category.validators");
exports.categoryRoutes = (0, express_1.Router)();
exports.categoryRoutes.get('/', (0, catchAsync_1.catchAsync)(async (_req, res) => {
    (0, respond_1.ok)(res, await category_service_1.categoryService.listPublic());
}));
const admin = [auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)('ADMIN')];
exports.categoryRoutes.get('/all', ...admin, (0, catchAsync_1.catchAsync)(async (_req, res) => {
    (0, respond_1.ok)(res, await category_service_1.categoryService.listAll());
}));
exports.categoryRoutes.post('/', ...admin, (0, validate_middleware_1.validate)({ body: category_validators_1.createCategorySchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await category_service_1.categoryService.create(req.body));
}));
exports.categoryRoutes.put('/reorder', ...admin, (0, validate_middleware_1.validate)({ body: category_validators_1.reorderCategoriesSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await category_service_1.categoryService.reorder(req.body.order);
    (0, respond_1.ok)(res, { reordered: true });
}));
exports.categoryRoutes.put('/:id', ...admin, (0, validate_middleware_1.validate)({ params: category_validators_1.idParamSchema, body: category_validators_1.updateCategorySchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await category_service_1.categoryService.update(Number(req.params.id), req.body));
}));
exports.categoryRoutes.delete('/:id', ...admin, (0, validate_middleware_1.validate)({ params: category_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await category_service_1.categoryService.remove(Number(req.params.id));
    (0, respond_1.noContent)(res);
}));
//# sourceMappingURL=category.routes.js.map