import { Prisma, type ShopifyShop } from '@prisma/client';
import { RequestedTokenType, Session } from '@shopify/shopify-api';
import { DEFAULT_SHOPIFY_SETTINGS, shopifySettingsSchema, type ShopifySettings } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/apiError';
import { getShopify } from './shopify.client';
import { decryptToken, encryptToken } from './shopify.crypto';
import { withShopLock } from './shopify.locks';

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

/** Refresh this long before the access token actually expires. */
const REFRESH_LEEWAY_MS = 2 * 60 * 1000;

/** Shop-facing view: never leaks tokens. */
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

/** True when the store has a usable (possibly refreshable) credential. */
export function isInstalled(shop: ShopifyShop | null): shop is ShopifyShop {
  return Boolean(shop && shop.accessToken && !shop.uninstalledAt);
}

function tokenColumns(session: Session) {
  if (!session.accessToken) throw ApiError.internal('Shopify session has no access token');
  return {
    accessToken: encryptToken(session.accessToken),
    accessTokenExpiresAt: session.expires ?? null,
    refreshToken: session.refreshToken ? encryptToken(session.refreshToken) : null,
    refreshTokenExpiresAt: session.refreshTokenExpires ?? null,
    scope: session.scope ?? null,
  };
}

function httpStatusOf(err: unknown): number | undefined {
  return (err as { response?: { code?: number } })?.response?.code;
}

export class ShopService {
  async findByDomain(shopDomain: string) {
    return prisma.shopifyShop.findUnique({ where: { shopDomain } });
  }

  /** Active install only (token present, not uninstalled). */
  async requireActive(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!isInstalled(shop)) {
      throw ApiError.unauthorized('App is not installed on this store', 'SHOPIFY_NOT_INSTALLED');
    }
    return shop;
  }

  /** Called after OAuth / token exchange / refresh: persist the credential. */
  async install(session: Session) {
    const columns = tokenColumns(session);
    const shop = await prisma.shopifyShop.upsert({
      where: { shopDomain: session.shop },
      create: { shopDomain: session.shop, ...columns, installedAt: new Date() },
      update: { ...columns, uninstalledAt: null },
    });
    logger.info('shopify.token_stored', {
      shop: session.shop,
      shopId: shop.id,
      expiring: Boolean(session.expires),
      expiresAt: session.expires ?? null,
    });
    return shop;
  }

  /**
   * Ensure the store has a live token, exchanging the App Bridge session
   * token when it has none. Serialised per shop: Shopify revokes every
   * other token when it issues a new one, so concurrent exchanges would
   * leave a dead token in the database.
   */
  async ensureInstalledViaTokenExchange(shopDomain: string, sessionToken: string) {
    const existing = await this.findByDomain(shopDomain);
    if (isInstalled(existing)) return existing;
    return withShopLock(shopDomain, async () => {
      const again = await this.findByDomain(shopDomain);
      if (isInstalled(again)) return again;
      const shopify = getShopify();
      const { session } = await shopify.auth.tokenExchange({
        shop: shopDomain,
        sessionToken,
        requestedTokenType: RequestedTokenType.OfflineAccessToken,
        expiring: true,
      });
      return this.install(session);
    });
  }

  /** app/uninstalled: keep the row (settings, mappings, orders) but drop credentials. */
  async markUninstalled(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!shop) return;
    await prisma.shopifyShop.update({
      where: { id: shop.id },
      data: { accessToken: null, refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, uninstalledAt: new Date() },
    });
    logger.info('shopify.uninstalled', { shop: shopDomain });
  }

  /** Credential is dead but the app may still be installed: next admin load re-exchanges. */
  private async clearTokens(shopId: number) {
    await prisma.shopifyShop.update({
      where: { id: shopId },
      data: { accessToken: null, refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null },
    });
  }

  /** GDPR shop/redact: remove everything we hold for the store. */
  async purge(shopDomain: string) {
    const shop = await this.findByDomain(shopDomain);
    if (!shop) return;
    await prisma.shopifyShop.delete({ where: { id: shop.id } });
    logger.info('shopify.purged', { shop: shopDomain });
  }

  private toSession(shop: ShopifyShop): Session {
    if (!shop.accessToken) throw ApiError.unauthorized('Store has no access token', 'SHOPIFY_NOT_INSTALLED');
    const shopify = getShopify();
    return new Session({
      id: shopify.session.getOfflineId(shop.shopDomain),
      shop: shop.shopDomain,
      state: 'offline',
      isOnline: false,
      accessToken: decryptToken(shop.accessToken),
      scope: shop.scope ?? undefined,
      expires: shop.accessTokenExpiresAt ?? undefined,
      refreshToken: shop.refreshToken ? decryptToken(shop.refreshToken) : undefined,
      refreshTokenExpires: shop.refreshTokenExpiresAt ?? undefined,
    });
  }

  private needsRefresh(shop: ShopifyShop): boolean {
    return Boolean(
      shop.accessTokenExpiresAt && shop.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_LEEWAY_MS,
    );
  }

  /**
   * Swap the refresh token for a new access token. `force` is used after a
   * 401 (Shopify says the token is dead even though it hasn't expired).
   */
  private async refreshTokens(shop: ShopifyShop, force = false): Promise<ShopifyShop> {
    return withShopLock(shop.shopDomain, async () => {
      const current = await this.findByDomain(shop.shopDomain);
      if (!isInstalled(current)) throw ApiError.unauthorized('App is not installed on this store', 'SHOPIFY_NOT_INSTALLED');
      // Someone else refreshed while we waited for the lock.
      if (current.accessToken !== shop.accessToken && !this.needsRefresh(current)) return current;
      if (!force && !this.needsRefresh(current)) return current;
      if (!current.refreshToken) {
        await this.clearTokens(current.id);
        throw ApiError.unauthorized('Shopify access expired; reopen the app to reconnect', 'SHOPIFY_REAUTH');
      }
      try {
        const shopify = getShopify();
        const { session } = await shopify.auth.refreshToken({
          shop: current.shopDomain,
          refreshToken: decryptToken(current.refreshToken),
        });
        logger.info('shopify.token_refreshed', { shop: current.shopDomain });
        return this.install(session);
      } catch (err) {
        logger.warn('shopify.token_refresh_failed', { shop: current.shopDomain, error: String(err) });
        await this.clearTokens(current.id);
        throw ApiError.unauthorized('Shopify access expired; reopen the app to reconnect', 'SHOPIFY_REAUTH');
      }
    });
  }

  /** A session whose access token is valid for at least the next couple of minutes. */
  async activeSession(shop: ShopifyShop): Promise<{ shop: ShopifyShop; session: Session }> {
    const fresh = this.needsRefresh(shop) ? await this.refreshTokens(shop) : shop;
    return { shop: fresh, session: this.toSession(fresh) };
  }

  /** Admin GraphQL request; throws an ApiError on GraphQL-level errors. */
  async graphql<T = unknown>(shop: ShopifyShop, query: string, variables?: Record<string, unknown>): Promise<T> {
    const attempt = async (current: ShopifyShop) => {
      const shopify = getShopify();
      const { session } = await this.activeSession(current);
      const client = new shopify.clients.Graphql({ session });
      const res = await client.request<T>(query, { variables, retries: 2 });
      return res.data as T;
    };

    try {
      return await attempt(shop);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const status = httpStatusOf(err);
      if (status === 401) {
        // Token revoked (reinstall, token rotation elsewhere). One refresh, one retry.
        logger.warn('shopify.token_rejected', { shop: shop.shopDomain });
        const refreshed = await this.refreshTokens(shop, true);
        try {
          return await attempt(refreshed);
        } catch (err2) {
          if (err2 instanceof ApiError) throw err2;
          if (httpStatusOf(err2) === 401) {
            await this.clearTokens(refreshed.id);
            throw ApiError.unauthorized('Shopify access was revoked; reopen the app to reconnect', 'SHOPIFY_REAUTH');
          }
          throw this.wrap(shop, err2);
        }
      }
      throw this.wrap(shop, err);
    }
  }

  /** Map SDK errors to API errors without touching stored credentials. */
  private wrap(shop: ShopifyShop, err: unknown): ApiError {
    const status = httpStatusOf(err);
    const message = err instanceof Error ? err.message : String(err);
    // GraphQL-level errors arrive as GraphqlQueryError (HTTP 200 + errors[]).
    if ((err as { body?: { errors?: { graphQLErrors?: { message: string }[] } } })?.body?.errors?.graphQLErrors?.length) {
      const first = (err as { body: { errors: { graphQLErrors: { message: string }[] } } }).body.errors.graphQLErrors[0];
      logger.warn('shopify.graphql_errors', { shop: shop.shopDomain, message: first.message });
      return ApiError.badRequest(first.message || 'Shopify rejected the request', 'SHOPIFY_GRAPHQL_ERROR');
    }
    if (status === 403) {
      logger.warn('shopify.forbidden', { shop: shop.shopDomain, message });
      return ApiError.forbidden(
        'Shopify refused this request. Check the app\'s access scopes and protected customer data approval.',
        'SHOPIFY_FORBIDDEN',
      );
    }
    logger.error('shopify.graphql_failed', { shop: shop.shopDomain, status, error: message });
    return ApiError.internal('Could not reach Shopify', 'SHOPIFY_UNAVAILABLE');
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
