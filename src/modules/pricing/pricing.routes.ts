import { Router } from 'express';
import { z } from 'zod';
import { designDocumentSchema } from '@cpd/shared';
import { catchAsync } from '../../utils/catchAsync';
import { ok } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { dec } from '../../utils/misc';
import { pricingService } from './pricing.service';

const quoteSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().min(1).max(10000).default(1),
  designJson: designDocumentSchema.nullable().optional(),
});

export const pricingRoutes = Router();

/** Live price quote for the designer/cart UI. Server-authoritative. */
pricingRoutes.post(
  '/quote',
  validate({ body: quoteSchema }),
  catchAsync(async (req, res) => {
    const { productId, variantId, quantity, designJson } = req.body;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

    let basePrice = dec(product.basePrice);
    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
      });
      if (!variant) throw ApiError.badRequest('Variant does not belong to product', 'VARIANT_MISMATCH');
      if (variant.price !== null) basePrice = dec(variant.price);
    }

    const rules = pricingService.resolveRules(product.pricingRules);
    const breakdown = pricingService.quote(basePrice, rules, designJson ?? null, quantity);
    ok(res, breakdown);
  }),
);
