import { OrderStatus, Prisma } from '@prisma/client';
import { DesignDocument } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../utils/apiError';
import { dec, generateOrderNumber } from '../../utils/misc';
import { pricingService } from '../pricing/pricing.service';
import { logger } from '../../config/logger';

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

const orderInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
      variant: { select: { id: true, name: true, color: true, colorName: true, size: true } },
      design: { select: { id: true, name: true, previewImage: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export class OrderService {
  /**
   * Checkout: converts the user's cart into an order inside one transaction.
   * Each line is re-priced from source data, and the design JSON is frozen
   * into `designSnapshot` so later edits never affect the purchased design.
   */
  async createFromCart(userId: number, shippingAddress: ShippingAddress) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true, variant: true, design: true },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest('Your cart is empty', 'CART_EMPTY');
    }

    // Re-price every line server-side at checkout time.
    const pricedLines = cart.items.map((item) => {
      if (item.product.status !== 'ACTIVE') {
        throw ApiError.badRequest(`"${item.product.name}" is no longer available`, 'PRODUCT_UNAVAILABLE');
      }
      let basePrice = dec(item.product.basePrice);
      if (item.variant) {
        if (item.variant.status !== 'ACTIVE') {
          throw ApiError.badRequest(`Selected option for "${item.product.name}" is unavailable`, 'VARIANT_UNAVAILABLE');
        }
        if (item.variant.price !== null) basePrice = dec(item.variant.price);
      }
      const design = item.design
        ? (item.design.designJson as unknown as DesignDocument)
        : null;
      const rules = pricingService.resolveRules(item.product.pricingRules);
      const breakdown = pricingService.quote(basePrice, rules, design, item.quantity);
      return { item, breakdown, design };
    });

    const totals = pricingService.totals(
      pricedLines.map((l) => l.breakdown.totalPrice),
      env.TAX_RATE,
      env.FLAT_SHIPPING,
      env.FREE_SHIPPING_THRESHOLD,
    );

    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          orderNumber: generateOrderNumber(),
          status: 'PENDING',
          subtotal: new Prisma.Decimal(totals.subtotal),
          tax: new Prisma.Decimal(totals.tax),
          shipping: new Prisma.Decimal(totals.shipping),
          total: new Prisma.Decimal(totals.total),
          paymentStatus: 'UNPAID',
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          items: {
            create: pricedLines.map(({ item, breakdown, design }) => ({
              productId: item.productId,
              variantId: item.variantId,
              designId: item.designId,
              quantity: item.quantity,
              price: new Prisma.Decimal(breakdown.unitPrice),
              designSnapshot: design
                ? (design as unknown as Prisma.InputJsonValue)
                : undefined,
              productName: item.product.name,
              variantName: item.variant?.name ?? null,
            })),
          },
        },
        include: orderInclude,
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return createdOrder;
    });

    logger.info('order.created', { orderId: order.id, userId, total: totals.total });
    return this.serialize(order);
  }

  async listForUser(userId: number) {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    });
    return orders.map((o) => this.serialize(o));
  }

  async getForUser(id: number, userId: number, isAdmin = false) {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    if (order.userId !== userId && !isAdmin) throw ApiError.forbidden();
    return this.serialize(order);
  }

  async listAll(page: number, pageSize: number, status?: OrderStatus) {
    const where: Prisma.OrderWhereInput = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    return { items: items.map((o) => this.serialize(o)), total };
  }

  async updateStatus(id: number, status: OrderStatus) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      include: orderInclude,
    });
    logger.info('order.status_changed', { orderId: id, status });
    return this.serialize(updated);
  }

  /** The frozen design snapshot for production/export. */
  async getItemSnapshot(orderId: number, itemId: number, userId: number, isAdmin: boolean) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    if (order.userId !== userId && !isAdmin) throw ApiError.forbidden();
    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw ApiError.notFound('Order item not found', 'ORDER_ITEM_NOT_FOUND');
    return item;
  }

  private serialize(
    order: Prisma.OrderGetPayload<{ include: typeof orderInclude }> & {
      user?: { id: number; name: string; email: string };
    },
  ) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: dec(order.subtotal),
      tax: dec(order.tax),
      shipping: dec(order.shipping),
      total: dec(order.total),
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      user: order.user,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: dec(item.price),
        productName: item.productName,
        variantName: item.variantName,
        hasDesign: Boolean(item.designSnapshot),
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              slug: item.product.slug,
              image: item.product.images[0]?.url ?? null,
            }
          : null,
        variant: item.variant,
        design: item.design,
      })),
    };
  }
}

export const orderService = new OrderService();
