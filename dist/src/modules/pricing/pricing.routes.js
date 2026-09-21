"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const shared_1 = require("@cpd/shared");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const misc_1 = require("../../utils/misc");
const pricing_service_1 = require("./pricing.service");
const quoteSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    variantId: zod_1.z.number().int().positive().nullable().optional(),
    quantity: zod_1.z.number().int().min(1).max(10000).default(1),
    designJson: shared_1.designDocumentSchema.nullable().optional(),
});
exports.pricingRoutes = (0, express_1.Router)();
/** Live price quote for the designer/cart UI. Server-authoritative. */
exports.pricingRoutes.post('/quote', (0, validate_middleware_1.validate)({ body: quoteSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { productId, variantId, quantity, designJson } = req.body;
    const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
    if (!product)
        throw apiError_1.ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    let basePrice = (0, misc_1.dec)(product.basePrice);
    if (variantId) {
        const variant = await prisma_1.prisma.productVariant.findFirst({
            where: { id: variantId, productId },
        });
        if (!variant)
            throw apiError_1.ApiError.badRequest('Variant does not belong to product', 'VARIANT_MISMATCH');
        if (variant.price !== null)
            basePrice = (0, misc_1.dec)(variant.price);
    }
    const rules = pricing_service_1.pricingService.resolveRules(product.pricingRules);
    const breakdown = pricing_service_1.pricingService.quote(basePrice, rules, designJson ?? null, quantity);
    (0, respond_1.ok)(res, breakdown);
}));
//# sourceMappingURL=pricing.routes.js.map