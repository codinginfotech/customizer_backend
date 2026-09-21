import { NextFunction, Request, Response, Router } from 'express';
import type { ShopifyShop } from '@prisma/client';
import { InvalidJwtError } from '@shopify/shopify-api';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError } from '../../utils/apiError';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getShopify } from './shopify.client';
import { shopService } from './shop.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireShopifySession / requireAppProxy. */
      shopify?: { shop: ShopifyShop };
    }
  }
}

/**
 * Where to send a merchant after OAuth: the app *inside* the Shopify admin
 * (https://admin.shopify.com/store/<store>/apps/<client id>). Redirecting to
 * our own /shopify/admin at top level would just show the install screen
 * again, because the page is not framed by the admin.
 */
export function shopifyAdminAppUrl(shopDomain: string, host?: string): string {
  const shopify = getShopify();
  if (host) {
    try {
      return shopify.auth.buildEmbeddedAppUrl(host);
    } catch {
      /* malformed host param — fall through to the shop-domain form */
    }
  }
  return `https://${shopDomain}/admin/apps/${env.SHOPIFY_API_KEY}`;
}

function shopParam(req: Request): string {
  const shopify = getShopify();
  const raw = String(req.query.shop || '');
  const shop = shopify.utils.sanitizeShop(raw, false);
  if (!shop) throw ApiError.badRequest('Missing or invalid "shop" parameter', 'SHOPIFY_INVALID_SHOP');
  return shop;
}

/**
 * Embedded-admin auth. App Bridge sends a short-lived session token (JWT)
 * as `Authorization: Bearer …`. We verify it, then — with Shopify managed
 * installation there is no OAuth redirect — exchange it for an offline
 * access token the first time we see a store.
 */
export async function requireShopifySession(req: Request, _res: Response, next: NextFunction) {
  try {
    const shopify = getShopify();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw ApiError.unauthorized('Missing Shopify session token', 'SHOPIFY_SESSION_REQUIRED');

    let payload;
    try {
      payload = await shopify.session.decodeSessionToken(token);
    } catch (err) {
      if (err instanceof InvalidJwtError) {
        throw ApiError.unauthorized('Invalid Shopify session token', 'SHOPIFY_SESSION_INVALID');
      }
      throw err;
    }
    const shopDomain = shopify.utils.sanitizeShop(new URL(payload.dest).hostname, true)!;

    // First load (or a dead credential): exchange the session token for an
    // offline token — serialised per shop, see shop.service.
    const shop = await shopService.ensureInstalledViaTokenExchange(shopDomain, token);
    req.shopify = { shop };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    logger.warn('shopify.session_failed', { error: String(err) });
    return next(ApiError.unauthorized('Could not authenticate with Shopify', 'SHOPIFY_REAUTH'));
  }
}

/**
 * App-proxy auth. Shopify forwards `https://{store}/apps/customizer/*` to us
 * with `shop`, `timestamp`, `path_prefix` and a `signature` computed over the
 * sorted query string with the app secret. Anything that fails is a 401.
 */
export async function requireAppProxy(req: Request, _res: Response, next: NextFunction) {
  try {
    const shopify = getShopify();
    const params = new URLSearchParams(req.originalUrl.split('?')[1] ?? '');
    const valid = await shopify.utils.validateHmac(params, { signator: 'appProxy' });
    if (!valid) throw ApiError.unauthorized('Invalid app proxy signature', 'SHOPIFY_PROXY_INVALID');
    const shopDomain = shopify.utils.sanitizeShop(String(params.get('shop') || ''), true)!;
    req.shopify = { shop: await shopService.requireActive(shopDomain) };
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Invalid app proxy request', 'SHOPIFY_PROXY_INVALID'));
  }
}

export const shopifyAuthRoutes = Router();

/** Legacy / non-managed install: top-level redirect into Shopify's OAuth. */
shopifyAuthRoutes.get(
  '/',
  catchAsync(async (req, res) => {
    const shopify = getShopify();
    const shop = shopParam(req);
    // begin() writes the state cookie and the 302 straight to `res`.
    await shopify.auth.begin({
      shop,
      callbackPath: '/api/shopify/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  }),
);

shopifyAuthRoutes.get(
  '/callback',
  catchAsync(async (req, res) => {
    const shopify = getShopify();
    // Public apps only get expiring offline tokens; ask for one explicitly so
    // the response carries the refresh token we store.
    const { session } = await shopify.auth.callback({ rawRequest: req, rawResponse: res, expiring: true });
    await shopService.install(session);
    const host = typeof req.query.host === 'string' ? req.query.host : undefined;
    res.redirect(shopifyAdminAppUrl(session.shop, host));
  }),
);
