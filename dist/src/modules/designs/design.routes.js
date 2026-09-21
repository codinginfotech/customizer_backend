"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.designRoutes = void 0;
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const design_service_1 = require("./design.service");
const design_validators_1 = require("./design.validators");
const zod_1 = require("zod");
exports.designRoutes = (0, express_1.Router)();
exports.designRoutes.use(auth_middleware_1.requireAuth);
exports.designRoutes.get('/', (0, validate_middleware_1.validate)({ query: design_validators_1.listDesignsQuerySchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await design_service_1.designService.list(req.user.id, page, pageSize);
    (0, respond_1.ok)(res, items, (0, respond_1.buildMeta)(page, pageSize, total));
}));
exports.designRoutes.post('/', (0, validate_middleware_1.validate)({ body: design_validators_1.createDesignSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await design_service_1.designService.create(req.user.id, req.body));
}));
exports.designRoutes.get('/:id', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await design_service_1.designService.getOwned(Number(req.params.id), req.user.id, req.user.role === 'ADMIN'));
}));
exports.designRoutes.put('/:id', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema, body: design_validators_1.updateDesignSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await design_service_1.designService.update(Number(req.params.id), req.user.id, req.body));
}));
exports.designRoutes.delete('/:id', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await design_service_1.designService.remove(Number(req.params.id), req.user.id);
    (0, respond_1.noContent)(res);
}));
exports.designRoutes.post('/:id/duplicate', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await design_service_1.designService.duplicate(Number(req.params.id), req.user.id));
}));
exports.designRoutes.post('/:id/share', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema, body: zod_1.z.object({ enabled: zod_1.z.boolean() }) }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await design_service_1.designService.setShared(Number(req.params.id), req.user.id, req.body.enabled));
}));
exports.designRoutes.post('/:id/versions', (0, validate_middleware_1.validate)({ params: design_validators_1.idParamSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.created)(res, await design_service_1.designService.createVersion(Number(req.params.id), req.user.id));
}));
exports.designRoutes.get('/:id/versions/:versionId', (0, validate_middleware_1.validate)({
    params: zod_1.z.object({
        id: zod_1.z.coerce.number().int().positive(),
        versionId: zod_1.z.coerce.number().int().positive(),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await design_service_1.designService.getVersion(Number(req.params.id), Number(req.params.versionId), req.user.id));
}));
//# sourceMappingURL=design.routes.js.map