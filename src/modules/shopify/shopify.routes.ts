import { Router } from 'express';
import { isShopifyConfigured } from './shopify.client';
import { shopifyAuthRoutes } from './shopify.auth';
import { shopifyAdminRoutes } from './admin.routes';
import { shopifyProxyRoutes, shopifyStorefrontRoutes } from './storefront.routes';

/**
 * /api/shopify/*
 *   auth/        OAuth begin + callback (legacy / non-managed installs)
 *   admin/       embedded admin (App Bridge session token)
 *   proxy/       app proxy, signed by Shopify (theme extension)
 *   storefront/  customizer page APIs (anonymous shoppers)
 *
 * Webhooks live at /api/shopify/webhooks but are mounted in app.ts because
 * they need the raw request body.
 */
export const shopifyRoutes = Router();

shopifyRoutes.get('/status', (_req, res) => {
  res.json({ success: true, data: { configured: isShopifyConfigured() } });
});

shopifyRoutes.use((_req, res, next) => {
  if (!isShopifyConfigured()) {
    res.status(503).json({
      success: false,
      message: 'Shopify integration is not configured on this server',
      code: 'SHOPIFY_NOT_CONFIGURED',
    });
    return;
  }
  next();
});

shopifyRoutes.use('/auth', shopifyAuthRoutes);
shopifyRoutes.use('/admin', shopifyAdminRoutes);
shopifyRoutes.use('/proxy', shopifyProxyRoutes);
shopifyRoutes.use('/storefront', shopifyStorefrontRoutes);
