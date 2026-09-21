import { Router } from 'express';
import { z } from 'zod';
import { shopifySettingsSchema } from '@cpd/shared';
import { catchAsync } from '../../utils/catchAsync';
import { ok, noContent, buildMeta } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../lib/prisma';
import { requireShopifySession } from './shopify.auth';
import { shopService, publicShop } from './shop.service';
import { mappingService } from './mapping.service';
import { shopifyOrderService } from './order.service';

/**
 * Embedded admin API. Every request carries an App Bridge session token;
 * `requireShopifySession` resolves it to the installed shop (performing the
 * token exchange on first load).
 */
export const shopifyAdminRoutes = Router();
shopifyAdminRoutes.use(requireShopifySession);

const shopifyIdParam = z.object({ shopifyProductId: z.string().regex(/^\d{1,20}$/) });

// ---------- shop ----------
shopifyAdminRoutes.get(
  '/shop',
  catchAsync(async (req, res) => {
    let shop = req.shopify!.shop;
    if (!shop.name) {
      // First load after install: pull the store's name/currency once.
      shop = await shopService.refreshShopInfo(shop).catch(() => shop);
    }
    ok(res, { ...publicShop(shop), stats: await shopifyOrderService.stats(shop.id) });
  }),
);

shopifyAdminRoutes.put(
  '/settings',
  validate({ body: shopifySettingsSchema.partial() }),
  catchAsync(async (req, res) => {
    ok(res, await shopService.updateSettings(req.shopify!.shop, req.body));
  }),
);

// ---------- catalog ----------
/** Customizer products the merchant can link to (active only). */
shopifyAdminRoutes.get(
  '/customizer-products',
  catchAsync(async (_req, res) => {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        category: { select: { name: true } },
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        _count: { select: { printAreas: true, variants: true } },
        model: { select: { modelType: true } },
      },
    });
    ok(
      res,
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category.name,
        imageUrl: p.images[0]?.url ?? null,
        printAreas: p._count.printAreas,
        variants: p._count.variants,
        has3d: Boolean(p.model),
      })),
    );
  }),
);

/** Shopify products (paginated by cursor) with their current mapping. */
shopifyAdminRoutes.get(
  '/products',
  validate({
    query: z.object({
      after: z.string().max(500).optional(),
      query: z.string().max(120).optional(),
      first: z.coerce.number().int().min(1).max(50).default(25),
    }),
  }),
  catchAsync(async (req, res) => {
    const q = req.query as { after?: string; query?: string; first?: number };
    ok(res, await mappingService.listShopifyProducts(req.shopify!.shop, q));
  }),
);

shopifyAdminRoutes.get(
  '/mappings',
  catchAsync(async (req, res) => {
    ok(res, await mappingService.listMappings(req.shopify!.shop.id));
  }),
);

shopifyAdminRoutes.put(
  '/products/:shopifyProductId/mapping',
  validate({
    params: shopifyIdParam,
    body: z.object({
      productId: z.number().int().positive(),
      variantMap: z.record(z.string().regex(/^\d{1,20}$/), z.number().int().positive()).optional(),
      enabled: z.boolean().optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    ok(
      res,
      await mappingService.upsertMapping(req.shopify!.shop, req.params.shopifyProductId, req.body.productId, {
        variantMap: req.body.variantMap,
        enabled: req.body.enabled,
      }),
    );
  }),
);

shopifyAdminRoutes.patch(
  '/products/:shopifyProductId/mapping',
  validate({ params: shopifyIdParam, body: z.object({ enabled: z.boolean() }) }),
  catchAsync(async (req, res) => {
    ok(res, await mappingService.setEnabled(req.shopify!.shop.id, req.params.shopifyProductId, req.body.enabled));
  }),
);

shopifyAdminRoutes.delete(
  '/products/:shopifyProductId/mapping',
  validate({ params: shopifyIdParam }),
  catchAsync(async (req, res) => {
    await mappingService.removeMapping(req.shopify!.shop.id, req.params.shopifyProductId);
    noContent(res);
  }),
);

// ---------- orders ----------
shopifyAdminRoutes.get(
  '/orders',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  catchAsync(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await shopifyOrderService.list(req.shopify!.shop.id, page, pageSize);
    ok(res, items, buildMeta(page, pageSize, total));
  }),
);

shopifyAdminRoutes.get(
  '/orders/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    ok(res, await shopifyOrderService.get(req.shopify!.shop.id, Number(req.params.id)));
  }),
);

/**
 * Production file download. Browsers can't attach the App Bridge header to a
 * plain link, so the SPA fetches this with the token and saves the blob.
 */
shopifyAdminRoutes.get(
  '/orders/:id/items/:itemId/production',
  validate({
    params: z.object({
      id: z.coerce.number().int().positive(),
      itemId: z.coerce.number().int().positive(),
    }),
    query: z.object({
      areaKey: z.string().max(64).optional(),
      dpi: z.coerce.number().int().min(72).max(600).default(300),
    }),
  }),
  catchAsync(async (req, res) => {
    const { png, fileName } = await shopifyOrderService.renderProductionFile(
      req.shopify!.shop.id,
      Number(req.params.id),
      Number(req.params.itemId),
      String(req.query.areaKey || ''),
      Number(req.query.dpi),
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(png);
  }),
);
