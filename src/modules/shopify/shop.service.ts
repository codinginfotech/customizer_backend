import { Prisma, type ShopifyShop } from '@prisma/client';
import { Session } from '@shopify/shopify-api';
import { DEFAULT_SHOPIFY_SETTINGS, shopifySettingsSchema, type ShopifySettings } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/apiError';
import { getShopify } from './shopify.client';
import { decryptToken, encryptToken } from './shopify.crypto';

const SHOP_INFO_QUERY = `#graphql
  query CpdShopInfo {
    shop {
      name
      email
      currencyCode
      primaryDomain { host }
    }
  }
`;

/** Shop-facing view: never leaks the access token. */
export function publicShop(shop: ShopifyShop) {
  return {
    id: shop.id,
    shopDomain: shop.shopDomain,
    name: shop.name,
    email: shop.email,
    currency: shop.currency,
    primaryDomain: shop.primaryDomain,
    installedAt: shop.installedAt,
    uninstalledAt: shop.uninstalledAt,
    settings: settingsOf(shop),
  };
}

export function settingsOf(shop: Pick<ShopifyShop, 'settings'>): ShopifySettings {
  const parsed = shopifySettingsSchema.safeParse(shop.settings ?? {});
  return parsed.success ? parsed.data : DEFAULT_SHOPIFY_SETTINGS;
}

export class ShopService {
  async findByDomain(shopDomain: string) {
    return prisma.shopifyShop.findUnique({ where: { shopDomain } });
  }

  /** Active install only (token present, not uninstalled). */
  async requireActive(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!shop || !shop.accessToken || shop.uninstalledAt) {
      throw ApiError.unauthorized('App is not installed on this store', 'SHOPIFY_NOT_INSTALLED');
    }
    return shop;
  }

  /** Called after OAuth / token exchange: persist the offline token. */
  async install(session: Session) {
    if (!session.accessToken) throw ApiError.internal('Shopify session has no access token');
    const shop = await prisma.shopifyShop.upsert({
      where: { shopDomain: session.shop },
      create: {
        shopDomain: session.shop,
        accessToken: encryptToken(session.accessToken),
        scope: session.scope ?? null,
        installedAt: new Date(),
      },
      update: {
        accessToken: encryptToken(session.accessToken),
        scope: session.scope ?? null,
        uninstalledAt: null,
        installedAt: new Date(),
      },
    });
    logger.info('shopify.installed', { shop: session.shop, shopId: shop.id });
    // Best-effort enrichment; a failed lookup must not block the install.
    void this.refreshShopInfo(shop).catch((err) =>
      logger.warn('shopify.shop_info_failed', { shop: session.shop, error: String(err) }),
    );
    return shop;
  }

  async markUninstalled(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!shop) return;
    await prisma.shopifyShop.update({
      where: { id: shop.id },
      data: { accessToken: null, uninstalledAt: new Date() },
    });
    logger.info('shopify.uninstalled', { shop: shopDomain });
  }

  /** GDPR shop/redact: remove everything we hold for the store. */
  async purge(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!shop) return;
    await prisma.shopifyShop.delete({ where: { id: shop.id } });
    logger.info('shopify.purged', { shop: shopDomain });
  }

  /** Rebuild an SDK Session from the stored offline token. */
  sessionFor(shop: ShopifyShop): Session {
    if (!shop.accessToken) throw ApiError.unauthorized('Store has no access token', 'SHOPIFY_NOT_INSTALLED');
    const shopify = getShopify();
    return new Session({
      id: shopify.session.getOfflineId(shop.shopDomain),
      shop: shop.shopDomain,
      state: 'offline',
      isOnline: false,
      accessToken: decryptToken(shop.accessToken),
      scope: shop.scope ?? undefined,
    });
  }

  /** Admin GraphQL request; throws an ApiError on GraphQL-level errors. */
  async graphql<T = unknown>(shop: ShopifyShop, query: string, variables?: Record<string, unknown>): Promise<T> {
    const shopify = getShopify();
    const client = new shopify.clients.Graphql({ session: this.sessionFor(shop) });
    try {
      const res = await client.request<T>(query, { variables, retries: 2 });
      if (res.errors?.graphQLErrors?.length) {
        logger.warn('shopify.graphql_errors', { shop: shop.shopDomain, errors: res.errors.graphQLErrors });
        throw ApiError.badRequest(
          res.errors.graphQLErrors[0]?.message || 'Shopify rejected the request',
          'SHOPIFY_GRAPHQL_ERROR',
        );
      }
      return res.data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const status = (err as { response?: { code?: number } })?.response?.code;
      if (status === 401 || status === 403) {
        // Token revoked (app removed) — force a re-install on next admin load.
        await this.markUninstalled(shop.shopDomain);
        throw ApiError.unauthorized('Shopify access was revoked; reinstall the app', 'SHOPIFY_REAUTH');
      }
      logger.error('shopify.graphql_failed', { shop: shop.shopDomain, error: String(err) });
      throw ApiError.internal('Could not reach Shopify', 'SHOPIFY_UNAVAILABLE');
    }
  }

  async refreshShopInfo(shop: ShopifyShop) {
    const data = await this.graphql<{
      shop: { name: string; email: string; currencyCode: string; primaryDomain: { host: string } };
    }>(shop, SHOP_INFO_QUERY);
    return prisma.shopifyShop.update({
      where: { id: shop.id },
      data: {
        name: data.shop.name,
        email: data.shop.email,
        currency: data.shop.currencyCode,
        primaryDomain: data.shop.primaryDomain?.host ?? null,
      },
    });
  }

  async updateSettings(shop: ShopifyShop, patch: Partial<ShopifySettings>) {
    const merged = shopifySettingsSchema.parse({ ...settingsOf(shop), ...patch });
    const updated = await prisma.shopifyShop.update({
      where: { id: shop.id },
      data: { settings: merged as unknown as Prisma.InputJsonValue },
    });
    return settingsOf(updated);
  }
}

export const shopService = new ShopService();
