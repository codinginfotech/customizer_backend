"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const upload_middleware_1 = require("../../middleware/upload.middleware");
const rateLimit_middleware_1 = require("../../middleware/rateLimit.middleware");
const upload_service_1 = require("./upload.service");
const apiError_1 = require("../../utils/apiError");
const validate_middleware_1 = require("../../middleware/validate.middleware");
exports.uploadRoutes = (0, express_1.Router)();
exports.uploadRoutes.use(auth_middleware_1.requireAuth);
/** User design asset upload (drag & drop onto the canvas). */
exports.uploadRoutes.post('/', rateLimit_middleware_1.uploadLimiter, upload_middleware_1.imageUpload.single('file'), (0, catchAsync_1.catchAsync)(async (req, res) => {
    if (!req.file)
        throw apiError_1.ApiError.badRequest('No file provided', 'NO_FILE');
    (0, respond_1.created)(res, await upload_service_1.uploadService.processDesignAsset(req.user.id, req.file));
}));
exports.uploadRoutes.get('/assets', (0, catchAsync_1.catchAsync)(async (req, res) => {
    (0, respond_1.ok)(res, await upload_service_1.uploadService.listAssets(req.user.id));
}));
exports.uploadRoutes.delete('/assets/:id', (0, validate_middleware_1.validate)({ params: zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() }) }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    await upload_service_1.uploadService.removeAsset(Number(req.params.id), req.user.id);
    (0, respond_1.noContent)(res);
}));
/** Admin uploads: product/template imagery and 3D models. */
exports.uploadRoutes.post('/admin/image', (0, auth_middleware_1.requireRole)('ADMIN'), rateLimit_middleware_1.uploadLimiter, upload_middleware_1.imageUpload.single('file'), (0, validate_middleware_1.validate)({ query: zod_1.z.object({ folder: zod_1.z.enum(['products', 'templates']).default('products') }) }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    if (!req.file)
        throw apiError_1.ApiError.badRequest('No file provided', 'NO_FILE');
    (0, respond_1.created)(res, await upload_service_1.uploadService.processAdminImage(req.file, req.query.folder));
}));
exports.uploadRoutes.post('/admin/model', (0, auth_middleware_1.requireRole)('ADMIN'), rateLimit_middleware_1.uploadLimiter, upload_middleware_1.modelUpload.single('file'), (0, catchAsync_1.catchAsync)(async (req, res) => {
    if (!req.file)
        throw apiError_1.ApiError.badRequest('No file provided', 'NO_FILE');
    (0, respond_1.created)(res, await upload_service_1.uploadService.processModelFile(req.file));
}));
//# sourceMappingURL=upload.routes.js.map