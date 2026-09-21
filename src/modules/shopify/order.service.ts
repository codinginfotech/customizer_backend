import { Prisma } from '@prisma/client';
import { SHOPIFY_LINE_ITEM_PROPS, type DesignDocument } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/apiError';
import { exportService } from '../export/export.service';
import { shopService } from './shop.service';

/** The subset of the orders/* webhook payload we read. */
export interface ShopifyOrderPayload {
  id: number | string;
  name?: string;
  order_number?: number;
  email?: string | null;
  contact_email?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  currency?: string | null;
  total_price?: string | null;
  created_at?: string | null;
  cancelled_at?: string | null;
  line_items?: ShopifyLineItemPayload[];
}

export interface ShopifyLineItemPayload {
  id: number | string;
  title?: string;
  name?: string;
  variant_title?: string | null;
  sku?: string | null;
  quantity?: number;
  price?: string | null;
  product_id?: number | string | null;
  variant_id?: number | string | null;
  properties?: Array<{ name: string; value: string | null }> | null;
}

/** Pull our customization token out of a line item's properties. */
export function customizationTokenOf(item: ShopifyLineItemPayload): string | null {
  const props = Array.isArray(item.properties) ? item.properties : [];
  const hit = props.find((p) => p && p.name === SHOPIFY_LINE_ITEM_PROPS.token && p.value);
  const value = hit?.value?.trim() ?? '';
  return /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

/** Only orders that contain at least one customized line are ours. */
export function customizedLineItems(payload: ShopifyOrderPayload) {
  return (payload.line_items ?? [])
    .map((item) => ({ item, token: customizationTokenOf(item) }))
    .filter((x): x is { item: ShopifyLineItemPayload; token: string } => Boolean(x.token));
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(value: string | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? new Prisma.Decimal(n.toFixed(2)) : null;
}

export class ShopifyOrderService {
  /**
   * orders/create + orders/paid. Idempotent: the order is upserted by its
   * Shopify id and line items are replaced wholesale, so a retry or a paid
   * event after a create simply refreshes the record.
   */
  async captureFromWebhook(shopDomain: string, payload: ShopifyOrderPayload) {
    const lines = customizedLineItems(payload);
    if (lines.length === 0) return null;
    const shop = await shopService.findByDomain(shopDomain);
    if (!shop) {
      logger.warn('shopify.order_unknown_shop', { shop: shopDomain });
      return null;
    }

    const tokens = [...new Set(lines.map((l) => l.token))];
    const customizations = await prisma.shopifyCustomization.findMany({
      where: { shopId: shop.id, token: { in: tokens } },
      include: { product: { select: { id: true } } },
    });
    const byToken = new Map(customizations.map((c) => [c.token, c]));

    const shopifyOrderId = String(payload.id);
    const orderData = {
      orderName: payload.name || (payload.order_number ? `#${payload.order_number}` : shopifyOrderId),
      financialStatus: payload.financial_status ?? null,
      fulfillmentStatus: payload.fulfillment_status ?? null,
      currency: payload.currency ?? null,
      totalPrice: toDecimal(payload.total_price),
      customerEmail: payload.email || payload.contact_email || null,
      cancelledAt: toDate(payload.cancelled_at),
      shopifyCreatedAt: toDate(payload.created_at),
    };

    const order = await prisma.$transaction(async (tx) => {
      const saved = await tx.shopifyOrder.upsert({
        where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId } },
        create: { shopId: shop.id, shopifyOrderId, ...orderData },
        update: orderData,
      });
      await tx.shopifyOrderItem.deleteMany({ where: { orderId: saved.id } });
      for (const { item, token } of lines) {
        const customization = byToken.get(token);
        await tx.shopifyOrderItem.create({
          data: {
            orderId: saved.id,
            lineItemId: String(item.id),
            customizationId: customization?.id ?? null,
            productId: customization?.productId ?? null,
            title: (item.title || item.name || 'Custom item').slice(0, 255),
            variantTitle: item.variant_title?.slice(0, 255) ?? null,
            sku: item.sku?.slice(0, 120) ?? null,
            quantity: Math.max(1, Number(item.quantity) || 1),
            price: toDecimal(item.price),
            // Freeze the design: later edits to the customization never change the order.
            designSnapshot: (customization?.designJson as Prisma.InputJsonValue) ?? undefined,
            previewImage: customization?.previewImage ?? null,
          },
        });
        if (!customization) {
          logger.warn('shopify.order_missing_customization', { shop: shopDomain, token, order: shopifyOrderId });
        }
      }
      if (customizations.length) {
        await tx.shopifyCustomization.updateMany({
          where: { id: { in: customizations.map((c) => c.id) } },
          data: { status: 'ORDERED' },
        });
      }
      return saved;
    });

    logger.info('shopify.order_captured', { shop: shopDomain, order: order.orderName, items: lines.length });
    return order;
  }

  /** orders/updated + orders/cancelled: only status fields change. */
  async syncStatusFromWebhook(shopDomain: string, payload: ShopifyOrderPayload) {
    const shop = await shopService.findByDomain(shopDomain);
    if (!shop) return;
    const existing = await prisma.shopifyOrder.findUnique({
      where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: String(payload.id) } },
    });
    if (!existing) {
      // An order we never saw — could be a customized order created before
      // the app was (re)installed. Capture it if it has our line items.
      await this.captureFromWebhook(shopDomain, payload);
      return;
    }
    await prisma.shopifyOrder.update({
      where: { id: existing.id },
      data: {
        financialStatus: payload.financial_status ?? existing.financialStatus,
        fulfillmentStatus: payload.fulfillment_status ?? existing.fulfillmentStatus,
        cancelledAt: toDate(payload.cancelled_at) ?? existing.cancelledAt,
      },
    });
  }

  /** GDPR customers/redact: drop the email on the named orders. */
  async redactCustomer(shopDomain: string, shopifyOrderIds: Array<number | string>) {
    const shop = await shopService.findByDomain(shopDomain);
    if (!shop || shopifyOrderIds.length === 0) return;
    await prisma.shopifyOrder.updateMany({
      where: { shopId: shop.id, shopifyOrderId: { in: shopifyOrderIds.map(String) } },
      data: { customerEmail: null },
    });
  }

  async list(shopId: number, page: number, pageSize: number) {
    const where = { shopId };
    const [items, total] = await prisma.$transaction([
      prisma.shopifyOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: {
            include: { product: { select: { id: true, name: true, slug: true, printAreas: { select: { key: true, name: true } } } } },
          },
        },
      }),
      prisma.shopifyOrder.count({ where }),
    ]);
    return { items, total };
  }

  async get(shopId: number, id: number) {
    const order = await prisma.shopifyOrder.findFirst({
      where: { id, shopId },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, slug: true, printAreas: { select: { key: true, name: true } } } } },
        },
      },
    });
    if (!order) throw ApiError.notFound('Order not found', 'SHOPIFY_ORDER_NOT_FOUND');
    return order;
  }

  /** Print-ready PNG for one customized line item. */
  async renderProductionFile(shopId: number, orderId: number, itemId: number, areaKey: string, dpi: number) {
    const item = await prisma.shopifyOrderItem.findFirst({
      where: { id: itemId, orderId, order: { shopId } },
      include: { order: { select: { orderName: true } } },
    });
    if (!item) throw ApiError.notFound('Order item not found', 'SHOPIFY_ORDER_ITEM_NOT_FOUND');
    if (!item.designSnapshot || !item.productId) {
      throw ApiError.badRequest('This line item has no design snapshot', 'NO_DESIGN_SNAPSHOT');
    }
    const png = await exportService.renderProductionFile(
      item.designSnapshot as unknown as DesignDocument,
      item.productId,
      areaKey,
      dpi,
    );
    const safeName = item.order.orderName.replace(/[^A-Za-z0-9#_-]/g, '');
    return { png, fileName: `${safeName}-item${item.id}-${areaKey || 'print'}-${dpi}dpi.png` };
  }

  async stats(shopId: number) {
    const [orders, customizations, mappings] = await prisma.$transaction([
      prisma.shopifyOrder.count({ where: { shopId } }),
      prisma.shopifyCustomization.count({ where: { shopId } }),
      prisma.shopifyProductMapping.count({ where: { shopId, enabled: true } }),
    ]);
    return { orders, customizations, mappings };
  }
}

export const shopifyOrderService = new ShopifyOrderService();
