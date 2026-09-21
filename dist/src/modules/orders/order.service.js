"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = exports.OrderService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const env_1 = require("../../config/env");
const apiError_1 = require("../../utils/apiError");
const misc_1 = require("../../utils/misc");
const pricing_service_1 = require("../pricing/pricing.service");
const logger_1 = require("../../config/logger");
const orderInclude = {
    items: {
        include: {
            product: { select: { id: true, name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
            variant: { select: { id: true, name: true, color: true, colorName: true, size: true } },
            design: { select: { id: true, name: true, previewImage: true } },
        },
    },
};
class OrderService {
    /**
     * Checkout: converts the user's cart into an order inside one transaction.
     * Each line is re-priced from source data, and the design JSON is frozen
     * into `designSnapshot` so later edits never affect the purchased design.
     */
    async createFromCart(userId, shippingAddress) {
        const cart = await prisma_1.prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: { product: true, variant: true, design: true },
                },
            },
        });
        if (!cart || cart.items.length === 0) {
            throw apiError_1.ApiError.badRequest('Your cart is empty', 'CART_EMPTY');
        }
        // Re-price every line server-side at checkout time.
        const pricedLines = cart.items.map((item) => {
            if (item.product.status !== 'ACTIVE') {
                throw apiError_1.ApiError.badRequest(`"${item.product.name}" is no longer available`, 'PRODUCT_UNAVAILABLE');
            }
            let basePrice = (0, misc_1.dec)(item.product.basePrice);
            if (item.variant) {
                if (item.variant.status !== 'ACTIVE') {
                    throw apiError_1.ApiError.badRequest(`Selected option for "${item.product.name}" is unavailable`, 'VARIANT_UNAVAILABLE');
                }
                if (item.variant.price !== null)
                    basePrice = (0, misc_1.dec)(item.variant.price);
            }
            const design = item.design
                ? item.design.designJson
                : null;
            const rules = pricing_service_1.pricingService.resolveRules(item.product.pricingRules);
            const breakdown = pricing_service_1.pricingService.quote(basePrice, rules, design, item.quantity);
            return { item, breakdown, design };
        });
        const totals = pricing_service_1.pricingService.totals(pricedLines.map((l) => l.breakdown.totalPrice), env_1.env.TAX_RATE, env_1.env.FLAT_SHIPPING, env_1.env.FREE_SHIPPING_THRESHOLD);
        const order = await prisma_1.prisma.$transaction(async (tx) => {
            const createdOrder = await tx.order.create({
                data: {
                    userId,
                    orderNumber: (0, misc_1.generateOrderNumber)(),
                    status: 'PENDING',
                    subtotal: new client_1.Prisma.Decimal(totals.subtotal),
                    tax: new client_1.Prisma.Decimal(totals.tax),
                    shipping: new client_1.Prisma.Decimal(totals.shipping),
                    total: new client_1.Prisma.Decimal(totals.total),
                    paymentStatus: 'UNPAID',
                    shippingAddress: shippingAddress,
                    items: {
                        create: pricedLines.map(({ item, breakdown, design }) => ({
                            productId: item.productId,
                            variantId: item.variantId,
                            designId: item.designId,
                            quantity: item.quantity,
                            price: new client_1.Prisma.Decimal(breakdown.unitPrice),
                            designSnapshot: design
                                ? design
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
        logger_1.logger.info('order.created', { orderId: order.id, userId, total: totals.total });
        return this.serialize(order);
    }
    async listForUser(userId) {
        const orders = await prisma_1.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: orderInclude,
        });
        return orders.map((o) => this.serialize(o));
    }
    async getForUser(id, userId, isAdmin = false) {
        const order = await prisma_1.prisma.order.findUnique({ where: { id }, include: orderInclude });
        if (!order)
            throw apiError_1.ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
        if (order.userId !== userId && !isAdmin)
            throw apiError_1.ApiError.forbidden();
        return this.serialize(order);
    }
    async listAll(page, pageSize, status) {
        const where = status ? { status } : {};
        const [items, total] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
            }),
            prisma_1.prisma.order.count({ where }),
        ]);
        return { items: items.map((o) => this.serialize(o)), total };
    }
    async updateStatus(id, status) {
        const order = await prisma_1.prisma.order.findUnique({ where: { id } });
        if (!order)
            throw apiError_1.ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
        const updated = await prisma_1.prisma.order.update({
            where: { id },
            data: { status },
            include: orderInclude,
        });
        logger_1.logger.info('order.status_changed', { orderId: id, status });
        return this.serialize(updated);
    }
    /** The frozen design snapshot for production/export. */
    async getItemSnapshot(orderId, itemId, userId, isAdmin) {
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            throw apiError_1.ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
        if (order.userId !== userId && !isAdmin)
            throw apiError_1.ApiError.forbidden();
        const item = await prisma_1.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
        if (!item)
            throw apiError_1.ApiError.notFound('Order item not found', 'ORDER_ITEM_NOT_FOUND');
        return item;
    }
    serialize(order) {
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            subtotal: (0, misc_1.dec)(order.subtotal),
            tax: (0, misc_1.dec)(order.tax),
            shipping: (0, misc_1.dec)(order.shipping),
            total: (0, misc_1.dec)(order.total),
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
            user: order.user,
            items: order.items.map((item) => ({
                id: item.id,
                quantity: item.quantity,
                price: (0, misc_1.dec)(item.price),
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
exports.OrderService = OrderService;
exports.orderService = new OrderService();
//# sourceMappingURL=order.service.js.map