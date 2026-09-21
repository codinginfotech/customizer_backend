import express, { Router } from 'express';
import { logger } from '../../config/logger';
import { getShopify, isShopifyConfigured } from './shopify.client';
import { shopService } from './shop.service';
import { shopifyOrderService, type ShopifyOrderPayload } from './order.service';

/**
 * Webhook receiver. Subscriptions are declared in shopify-app/shopify.app.toml
 * (app-specific webhooks), so nothing needs registering per store. The body
 * must be the raw bytes for the HMAC check, so this router is mounted in
 * app.ts *before* the JSON body parser.
 *
 * Shopify retries on non-2xx for up to 48 hours, so handlers are idempotent
 * (orders are upserted by Shopify id) and a handler failure returns 500.
 */
export const shopifyWebhookRoutes = Router();

type Handler = (shopDomain: string, body: unknown, webhookId: string) => Promise<void>;

const handlers: Record<string, Handler> = {
  APP_UNINSTALLED: async (shop) => {
    await shopService.markUninstalled(shop);
  },
  ORDERS_CREATE: async (shop, body) => {
    await shopifyOrderService.captureFromWebhook(shop, body as ShopifyOrderPayload);
  },
  ORDERS_PAID: async (shop, body) => {
    await shopifyOrderService.captureFromWebhook(shop, body as ShopifyOrderPayload);
  },
  ORDERS_UPDATED: async (shop, body) => {
    await shopifyOrderService.syncStatusFromWebhook(shop, body as ShopifyOrderPayload);
  },
  ORDERS_CANCELLED: async (shop, body) => {
    await shopifyOrderService.syncStatusFromWebhook(shop, body as ShopifyOrderPayload);
  },
  // GDPR compliance topics (mandatory for public apps).
  CUSTOMERS_DATA_REQUEST: async (shop, body) => {
    // We hold no customer profile — only order numbers and design snapshots.
    const payload = body as { orders_requested?: number[] };
    logger.info('shopify.gdpr.data_request', { shop, orders: payload.orders_requested?.length ?? 0 });
  },
  CUSTOMERS_REDACT: async (shop, body) => {
    const payload = body as { orders_to_redact?: number[] };
    await shopifyOrderService.redactCustomer(shop, payload.orders_to_redact ?? []);
  },
  SHOP_REDACT: async (shop) => {
    await shopService.purge(shop);
  },
};

shopifyWebhookRoutes.post(
  '/',
  express.raw({ type: '*/*', limit: '4mb' }),
  async (req, res) => {
    if (!isShopifyConfigured()) {
      res.status(503).json({ success: false, message: 'Shopify not configured', code: 'SHOPIFY_NOT_CONFIGURED' });
      return;
    }
    const shopify = getShopify();
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const check = await shopify.webhooks.validate({ rawBody, rawRequest: req, rawResponse: res });
    if (!check.valid) {
      logger.warn('shopify.webhook_rejected', { reason: check.reason });
      res.status(401).json({ success: false, message: 'Invalid webhook', code: 'SHOPIFY_WEBHOOK_INVALID' });
      return;
    }

    const topic = check.topic.replace(/\//g, '_').toUpperCase();
    const handler = handlers[topic];
    if (!handler) {
      // Unknown topics are acknowledged so Shopify stops retrying them.
      logger.info('shopify.webhook_ignored', { topic: check.topic, shop: check.domain });
      res.status(200).end();
      return;
    }
    try {
      const body = rawBody ? (JSON.parse(rawBody) as unknown) : {};
      await handler(check.domain, body, check.webhookId);
      logger.info('shopify.webhook_handled', { topic: check.topic, shop: check.domain, id: check.webhookId });
      res.status(200).end();
    } catch (err) {
      logger.error('shopify.webhook_failed', { topic: check.topic, shop: check.domain, error: String(err) });
      res.status(500).end();
    }
  },
);
