"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const catchAsync_1 = require("../../utils/catchAsync");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const export_service_1 = require("./export.service");
exports.exportRoutes = (0, express_1.Router)();
exports.exportRoutes.use(auth_middleware_1.requireAuth);
/** Production-quality export of a saved design's print area. */
exports.exportRoutes.get('/designs/:id', (0, validate_middleware_1.validate)({
    params: zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() }),
    query: zod_1.z.object({
        areaKey: zod_1.z.string().max(64).optional(),
        dpi: zod_1.z.coerce.number().int().min(72).max(600).default(300),
    }),
}), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const design = await prisma_1.prisma.design.findUnique({ where: { id: Number(req.params.id) } });
    if (!design)
        throw apiError_1.ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
    if (design.userId !== req.user.id && req.user.role !== 'ADMIN') {
        throw apiError_1.ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
    }
    const png = await export_service_1.exportService.renderProductionFile(design.designJson, design.productId, String(req.query.areaKey || ''), Number(req.query.dpi));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="design-${design.id}-${req.query.areaKey || 'print'}-${req.query.dpi}dpi.png"`);
    res.send(png);
}));
//# sourceMappingURL=export.routes.js.map