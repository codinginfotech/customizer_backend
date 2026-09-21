import '@shopify/shopify-api/adapters/node';
import { ApiVersion, LogSeverity, shopifyApi, type Shopify } from '@shopify/shopify-api';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/apiError';

/**
 * Lazily-built @shopify/shopify-api instance. The API boots fine without the
 * Shopify variables set; every /api/shopify route then answers 503 so a
 * misconfigured deploy is obvious rather than silently broken.
 */

let instance: Shopify | null = null;

export function isShopifyConfigured(): boolean {
  return Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET && env.SHOPIFY_APP_URL);
}

/** The public origin the app is served from (frontend host; /api is proxied). */
export function shopifyAppUrl(): URL {
  if (!env.SHOPIFY_APP_URL) throw ApiError.internal('SHOPIFY_APP_URL is not set', 'SHOPIFY_NOT_CONFIGURED');
  return new URL(env.SHOPIFY_APP_URL);
}

export function shopifyScopes(): string[] {
  return env.SHOPIFY_SCOPES.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getShopify(): Shopify {
  if (instance) return instance;
  if (!isShopifyConfigured()) {
    throw new ApiError(503, 'Shopify integration is not configured on this server', 'SHOPIFY_NOT_CONFIGURED');
  }
  const url = shopifyAppUrl();
  instance = shopifyApi({
    apiKey: env.SHOPIFY_API_KEY!,
    apiSecretKey: env.SHOPIFY_API_SECRET!,
    scopes: shopifyScopes(),
    hostName: url.host,
    hostScheme: url.protocol === 'http:' ? 'http' : 'https',
    apiVersion: env.SHOPIFY_API_VERSION as ApiVersion,
    isEmbeddedApp: true,
    logger: {
      level: env.NODE_ENV === 'production' ? LogSeverity.Warning : LogSeverity.Info,
      log: (severity, message) => {
        const line = `shopify.sdk ${message}`;
        if (severity <= LogSeverity.Error) logger.error(line);
        else if (severity === LogSeverity.Warning) logger.warn(line);
        else logger.info(line);
      },
    },
  });
  return instance;
}

/** `gid://shopify/Product/123` → `123`; plain numeric ids pass through. */
export function gidToId(gid: string | number | null | undefined): string | null {
  if (gid === null || gid === undefined) return null;
  const s = String(gid);
  const m = s.match(/\/(\d+)$/);
  return m ? m[1] : /^\d+$/.test(s) ? s : null;
}

export function toGid(kind: 'Product' | 'ProductVariant' | 'Order', id: string | number): string {
  return `gid://shopify/${kind}/${id}`;
}
