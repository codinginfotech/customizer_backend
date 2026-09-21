import { Router } from 'express';
import { z } from 'zod';
import { designDocumentSchema, type StorefrontProductConfig } from '@cpd/shared';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError } from '../../utils/apiError';
import { ok, created } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { imageUpload } from '../../middleware/upload.middleware';
import { shopifyProxyLimiter, uploadLimiter } from '../../middleware/rateLimit.middleware';
import { previewDataUrlSchema } from '../designs/design.validators';
import { productService } from '../products/product.service';
import { uploadService } from '../uploads/upload.service';
import { getShopify, shopifyAppUrl } from './shopify.client';
import { requireAppProxy } from './shopify.auth';
import { shopService, settingsOf } from './shop.service';
import { mappingService } from './mapping.service';
import { customizationService, toPublic, TOKEN_RE } from './customization.service';

const shopifyIdSchema = z.string().regex(/^\d{1,20}$/, 'Invalid Shopify id');
const tokenSchema = z.string().regex(TOKEN_RE, 'Invalid token');
const shopDomainSchema = z.string().min(4).max(255);

/** Resolve + validate the shop from an unauthenticated storefront request. */
async function shopFromQuery(raw: unknown) {
  const shopify = getShopify();
  const domain = shopify.utils.sanitizeShop(String(raw || ''), false);
  if (!domain) throw ApiError.badRequest('Missing or invalid shop', 'SHOPIFY_INVALID_SHOP');
  return shopService.requireActive(domain);
}

function customizeUrl(shopDomain: string, shopifyProductId: string, shopifyVariantId?: string | null) {
  const url = shopifyAppUrl();
  url.pathname = '/shopify/customize';
  url.searchParams.set('shop', shopDomain);
  url.searchParams.set('product', shopifyProductId);
  if (shopifyVariantId) url.searchParams.set('variant', shopifyVariantId);
  return url.toString();
}

/* ------------------------------------------------------------------------ *
 * App proxy — called by the theme extension on the merchant's storefront
 * (https://{store}/apps/customizer/…). Signed by Shopify; same-origin for
 * the shopper so no CORS is involved.
 * ------------------------------------------------------------------------ */
export const shopifyProxyRoutes = Router();
shopifyProxyRoutes.use(shopifyProxyLimiter, requireAppProxy);

shopifyProxyRoutes.get(
  '/config',
  validate({ query: z.object({ product_id: shopifyIdSchema }).passthrough() }),
  catchAsync(async (req, res) => {
    const shop = req.shopify!.shop;
    const shopifyProductId = String(req.query.product_id);
    const mapping = await mappingService.findMapping(shop.id, shopifyProductId);
    const settings = settingsOf(shop);
    const customizable = Boolean(mapping && mapping.enabled && mapping.product.status === 'ACTIVE');
    const config: StorefrontProductConfig = {
      customizable,
      shopifyProductId,
      product: customizable && mapping ? { id: mapping.product.id, slug: mapping.product.slug, name: mapping.product.name } : null,
      settings: {
        buttonLabel: settings.buttonLabel,
        launchMode: settings.launchMode,
        showPreviewInCart: settings.showPreviewInCart,
        requireDesign: settings.requireDesign,
      },
      customizeUrl: customizable ? customizeUrl(shop.shopDomain, shopifyProductId) : null,
    };
    // Shopify caches proxy responses only when told to; keep this fresh.
    res.setHeader('Cache-Control', 'no-store');
    ok(res, config);
  }),
);

/** Used by the full-page flow: the theme reads the token from the return URL. */
shopifyProxyRoutes.get(
  '/customizations/:token',
  validate({ params: z.object({ token: tokenSchema }) }),
  catchAsync(async (req, res) => {
    const c = await customizationService.get(req.shopify!.shop, req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    ok(res, toPublic(c));
  }),
);

/* ------------------------------------------------------------------------ *
 * Customizer page — the /shopify/customize route of the SPA, served from the
 * app's own origin. Anonymous by design: shoppers never sign in.
 * ------------------------------------------------------------------------ */
export const shopifyStorefrontRoutes = Router();

/** Everything the customize page needs to boot for one Shopify product. */
shopifyStorefrontRoutes.get(
  '/context',
  validate({
    query: z.object({
      shop: shopDomainSchema,
      product: shopifyIdSchema,
      variant: shopifyIdSchema.optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const shop = await shopFromQuery(req.query.shop);
    const shopifyProductId = String(req.query.product);
    const shopifyVariantId = req.query.variant ? String(req.query.variant) : null;
    const mapping = await mappingService.findMapping(shop.id, shopifyProductId);
    if (!mapping || !mapping.enabled || mapping.product.status !== 'ACTIVE') {
      throw ApiError.notFound('This product is not customizable', 'SHOPIFY_PRODUCT_NOT_CUSTOMIZABLE');
    }
    const product = await productService.getBySlug(mapping.product.slug);
    ok(res, {
      shop: { domain: shop.shopDomain, name: shop.name, primaryDomain: shop.primaryDomain },
      settings: settingsOf(shop),
      shopifyProductId,
      shopifyVariantId,
      shopifyProductTitle: mapping.shopifyProductTitle,
      variantId: mappingService.resolveVariantId(mapping, shopifyVariantId),
      product,
    });
  }),
);

const createSchema = z.object({
  shop: shopDomainSchema,
  shopifyProductId: shopifyIdSchema,
  shopifyVariantId: shopifyIdSchema.nullable().optional(),
  variantId: z.number().int().positive().nullable().optional(),
  designJson: designDocumentSchema,
  previewImage: previewDataUrlSchema,
});

shopifyStorefrontRoutes.post(
  '/customizations',
  validate({ body: createSchema }),
  catchAsync(async (req, res) => {
    const shop = await shopFromQuery(req.body.shop);
    created(res, await customizationService.create(shop, req.body));
  }),
);

shopifyStorefrontRoutes.get(
  '/customizations/:token',
  validate({ params: z.object({ token: tokenSchema }), query: z.object({ shop: shopDomainSchema }) }),
  catchAsync(async (req, res) => {
    const shop = await shopFromQuery(req.query.shop);
    ok(res, toPublic(await customizationService.get(shop, req.params.token)));
  }),
);

const updateSchema = z.object({
  shop: shopDomainSchema,
  editKey: z.string().min(16).max(128),
  shopifyVariantId: shopifyIdSchema.nullable().optional(),
  variantId: z.number().int().positive().nullable().optional(),
  designJson: designDocumentSchema.optional(),
  previewImage: previewDataUrlSchema,
});

shopifyStorefrontRoutes.put(
  '/customizations/:token',
  validate({ params: z.object({ token: tokenSchema }), body: updateSchema }),
  catchAsync(async (req, res) => {
    const shop = await shopFromQuery(req.body.shop);
    const { editKey, ...input } = req.body;
    ok(res, await customizationService.update(shop, req.params.token, editKey, input));
  }),
);

/** Guest artwork upload — sanitized exactly like account uploads. */
shopifyStorefrontRoutes.post(
  '/uploads',
  uploadLimiter,
  imageUpload.single('file'),
  validate({ query: z.object({ shop: shopDomainSchema }) }),
  catchAsync(async (req, res) => {
    const shop = await shopFromQuery(req.query.shop);
    if (!req.file) throw ApiError.badRequest('No file provided', 'NO_FILE');
    const processed = await uploadService.processImageFile(req.file, `shopify/${shop.id}`);
    created(res, {
      id: 0,
      fileName: req.file.originalname.slice(0, 255),
      fileUrl: processed.fileUrl,
      fileType: processed.contentType,
      fileSize: processed.fileSize,
      metadata: processed.metadata,
      createdAt: new Date().toISOString(),
    });
  }),
);
