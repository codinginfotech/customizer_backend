import { Prisma, type ShopifyCustomization, type ShopifyShop } from '@prisma/client';
import type { DesignDocument, StorefrontCustomization } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { logger } from '../../config/logger';
import { storePreview } from '../designs/design.service';
import { mappingService } from './mapping.service';
import { randomToken, safeEqual, sha256 } from './shopify.crypto';

/**
 * Storefront customizations: a shopper's design for one Shopify product.
 * There is no shopper account — the public `token` goes into the cart line
 * item and identifies the design to the order webhook; the `editKey` (only
 * ever returned once, at creation) authorises edits from the same browser.
 */

export function toPublic(c: ShopifyCustomization): StorefrontCustomization {
  return {
    token: c.token,
    productId: c.productId,
    variantId: c.variantId,
    shopifyProductId: c.shopifyProductId,
    shopifyVariantId: c.shopifyVariantId,
    designJson: c.designJson as unknown as DesignDocument,
    previewImage: c.previewImage,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export class CustomizationService {
  /** Validates the Shopify product is linked and returns the mapping. */
  private async requireMapping(shop: ShopifyShop, shopifyProductId: string) {
    const mapping = await mappingService.findMapping(shop.id, shopifyProductId);
    if (!mapping || !mapping.enabled || mapping.product.status !== 'ACTIVE') {
      throw ApiError.notFound('This product is not customizable', 'SHOPIFY_PRODUCT_NOT_CUSTOMIZABLE');
    }
    return mapping;
  }

  async create(
    shop: ShopifyShop,
    input: {
      shopifyProductId: string;
      shopifyVariantId?: string | null;
      variantId?: number | null;
      designJson: DesignDocument;
      previewImage?: string;
    },
  ) {
    const mapping = await this.requireMapping(shop, input.shopifyProductId);
    if (input.designJson.productId !== mapping.productId) {
      throw ApiError.badRequest('Design does not belong to the linked product', 'PRODUCT_MISMATCH');
    }
    const variantId = await this.validVariant(mapping.productId, input.variantId ?? null);
    const editKey = randomToken(32);
    const previewImage = input.previewImage ? await storePreview(input.previewImage) : null;
    const customization = await prisma.shopifyCustomization.create({
      data: {
        shopId: shop.id,
        token: randomToken(24),
        editKeyHash: sha256(editKey),
        productId: mapping.productId,
        variantId,
        shopifyProductId: input.shopifyProductId,
        shopifyVariantId: input.shopifyVariantId ?? null,
        designJson: input.designJson as unknown as Prisma.InputJsonValue,
        previewImage,
      },
    });
    logger.info('shopify.customization_created', { shop: shop.shopDomain, token: customization.token });
    return { customization: toPublic(customization), editKey };
  }

  async get(shop: ShopifyShop, token: string) {
    if (!TOKEN_RE.test(token)) throw ApiError.notFound('Customization not found', 'CUSTOMIZATION_NOT_FOUND');
    const c = await prisma.shopifyCustomization.findUnique({ where: { token } });
    if (!c || c.shopId !== shop.id) throw ApiError.notFound('Customization not found', 'CUSTOMIZATION_NOT_FOUND');
    return c;
  }

  /** Edits require the edit key; ordered customizations are frozen. */
  async update(
    shop: ShopifyShop,
    token: string,
    editKey: string,
    input: {
      shopifyVariantId?: string | null;
      variantId?: number | null;
      designJson?: DesignDocument;
      previewImage?: string;
    },
  ) {
    const existing = await this.get(shop, token);
    if (!editKey || !safeEqual(sha256(editKey), existing.editKeyHash)) {
      throw ApiError.forbidden('You cannot edit this customization', 'CUSTOMIZATION_EDIT_DENIED');
    }
    if (existing.status === 'ORDERED') {
      throw ApiError.conflict('This customization has already been ordered', 'CUSTOMIZATION_ORDERED');
    }
    if (input.designJson && input.designJson.productId !== existing.productId) {
      throw ApiError.badRequest('Design does not belong to the linked product', 'PRODUCT_MISMATCH');
    }
    const variantId =
      input.variantId !== undefined ? await this.validVariant(existing.productId, input.variantId) : undefined;
    const previewImage = input.previewImage ? await storePreview(input.previewImage) : undefined;
    const updated = await prisma.shopifyCustomization.update({
      where: { id: existing.id },
      data: {
        ...(input.designJson ? { designJson: input.designJson as unknown as Prisma.InputJsonValue } : {}),
        ...(variantId !== undefined ? { variantId } : {}),
        ...(input.shopifyVariantId !== undefined ? { shopifyVariantId: input.shopifyVariantId } : {}),
        ...(previewImage !== undefined ? { previewImage } : {}),
      },
    });
    return toPublic(updated);
  }

  private async validVariant(productId: number, variantId: number | null): Promise<number | null> {
    if (!variantId) return null;
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw ApiError.badRequest('Variant does not belong to product', 'VARIANT_MISMATCH');
    return variant.id;
  }

  /** Housekeeping: drafts older than `days` that never reached an order. */
  async pruneDrafts(days = 30) {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await prisma.shopifyCustomization.deleteMany({
      where: { status: 'DRAFT', updatedAt: { lt: cutoff } },
    });
    if (result.count) logger.info('shopify.customizations_pruned', { count: result.count });
    return result.count;
  }
}

export const customizationService = new CustomizationService();
