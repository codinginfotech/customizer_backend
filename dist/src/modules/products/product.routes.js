"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRoutes = void 0;
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const product_service_1 = require("./product.service");
const audit_service_1 = require("../../services/audit.service");
const product_validators_1 = require("./product.validators");
exports.productRoutes = (0, express_1.Router)();
const admin = [auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)('ADMIN')];
// ---------- public ----------
exports.productRoutes.get('/', (0, validate_middleware_1.validate)({ query: product_validators_1.listProductsQuerySchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const q = req.query;
    const result = await product_service_1.productService.list(q);
    (0, respond_1.ok)(res, result.items, (0, respond_1.buildMeta)(result.page, result.pageSize, result.total));
}));
// Admin listing (includes inactive) — registered before /:slug so it matches first.
exports.productRoutes.get('/admin/all', ...admin, (0, validate_middleware_1.validate)({ query: product_validators_1.listProductsQuerySchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const q = req.query;
    const result = await product_service_1.productService.list(q, true);
    (0, respond_1.ok)(res, result.items, (0, respond_1.buildMeta)(result.page, result.pageSize, result.total));
}));
exports.productRoutes.get('/admin/:id', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await product_service_1.productService.getById(Number(req.params.id)));
}));
exports.productRoutes.get('/:slug', (0, validate_middleware_1.validate)({ params: product_validators_1.slugParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await product_service_1.productService.getBySlug(req.params.slug));
}));
// ---------- admin: product CRUD ----------
exports.productRoutes.post('/', ...admin, (0, validate_middleware_1.validate)({ body: product_validators_1.createProductSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const product = await product_service_1.productService.create(req.body);
    void (0, audit_service_1.audit)(req.user.id, 'product.created', 'product', product.id, { name: product.name });
    (0, respond_1.created)(res, product);
}));
exports.productRoutes.put('/:id', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema, body: product_validators_1.updateProductSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const product = await product_service_1.productService.update(Number(req.params.id), req.body);
    void (0, audit_service_1.audit)(req.user.id, 'product.updated', 'product', product.id, {
        fields: Object.keys(req.body),
        version: product.version,
    });
    (0, respond_1.ok)(res, product);
}));
exports.productRoutes.delete('/:id', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const result = await product_service_1.productService.remove(Number(req.params.id));
    void (0, audit_service_1.audit)(req.user.id, 'product.deleted', 'product', Number(req.params.id), result);
    (0, respond_1.ok)(res, result);
}));
// ---------- admin: variants ----------
exports.productRoutes.post('/:id/variants', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema, body: product_validators_1.variantSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await product_service_1.productService.addVariant(Number(req.params.id), req.body));
}));
exports.productRoutes.put('/:id/variants/:childId', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.productChildParamSchema, body: product_validators_1.variantSchema.partial() }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await product_service_1.productService.updateVariant(Number(req.params.id), Number(req.params.childId), req.body));
}));
exports.productRoutes.delete('/:id/variants/:childId', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.productChildParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await product_service_1.productService.removeVariant(Number(req.params.id), Number(req.params.childId));
    (0, respond_1.noContent)(res);
}));
// ---------- admin: print areas ----------
exports.productRoutes.post('/:id/print-areas', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema, body: product_validators_1.printAreaSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await product_service_1.productService.addPrintArea(Number(req.params.id), req.body));
}));
exports.productRoutes.put('/:id/print-areas/:childId', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.productChildParamSchema, body: product_validators_1.printAreaSchema.partial() }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await product_service_1.productService.updatePrintArea(Number(req.params.id), Number(req.params.childId), req.body));
}));
exports.productRoutes.delete('/:id/print-areas/:childId', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.productChildParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await product_service_1.productService.removePrintArea(Number(req.params.id), Number(req.params.childId));
    (0, respond_1.noContent)(res);
}));
// ---------- admin: images ----------
exports.productRoutes.post('/:id/images', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema, body: product_validators_1.productImageSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await product_service_1.productService.addImage(Number(req.params.id), req.body));
}));
exports.productRoutes.delete('/:id/images/:childId', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.productChildParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await product_service_1.productService.removeImage(Number(req.params.id), Number(req.params.childId));
    (0, respond_1.noContent)(res);
}));
// ---------- admin: 3D model ----------
exports.productRoutes.put('/:id/model', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema, body: product_validators_1.productModelSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const model = await product_service_1.productService.upsertModel(Number(req.params.id), req.body);
    void (0, audit_service_1.audit)(req.user.id, 'product.model_updated', 'product', Number(req.params.id), {
        modelType: req.body.modelType,
        qualityScore: model.qualityScore,
    });
    (0, respond_1.ok)(res, model);
}));
exports.productRoutes.delete('/:id/model', ...admin, (0, validate_middleware_1.validate)({ params: product_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await product_service_1.productService.removeModel(Number(req.params.id));
    (0, respond_1.noContent)(res);
}));
//# sourceMappingURL=product.routes.js.map