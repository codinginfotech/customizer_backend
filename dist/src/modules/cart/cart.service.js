"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartService = exports.CartService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const misc_1 = require("../../utils/misc");
const pricing_service_1 = require("../pricing/pricing.service");
const cartInclude = {
    items: {
        orderBy: { id: 'asc' },
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    basePrice: true,
                    images: { where: { isPrimary: true }, take: 1 },
                },
            },
            variant: true,
            design: { select: { id: true, name: true, previewImage: true } },
        },
    },
};
class CartService {
    async getOrCreateCart(userId) {
        return prisma_1.prisma.cart.upsert({
            where: { userId },
            create: { userId },
            update: {},
            include: cartInclude,
        });
    }
    /** Re-price a line item from source data — never trust the client. */
    async priceLine(productId, variantId, designId, quantity) {
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.status !== 'ACTIVE') {
            throw apiError_1.ApiError.notFound('Product is unavailable', 'PRODUCT_NOT_FOUND');
        }
        let basePrice = (0, misc_1.dec)(product.basePrice);
        if (variantId) {
            const variant = await prisma_1.prisma.productVariant.findFirst({
                where: { id: variantId, productId, status: 'ACTIVE' },
            });
            if (!variant)
                throw apiError_1.ApiError.badRequest('Variant is unavailable', 'VARIANT_MISMATCH');
            if (variant.price !== null)
                basePrice = (0, misc_1.dec)(variant.price);
        }
        let design = null;
        if (designId) {
            const record = await prisma_1.prisma.design.findUnique({ where: { id: designId } });
            if (!record)
                throw apiError_1.ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
            design = record.designJson;
        }
        const rules = pricing_service_1.pricingService.resolveRules(product.pricingRules);
        return pricing_service_1.pricingService.quote(basePrice, rules, design, quantity);
    }
    async getCart(userId) {
        const cart = await this.getOrCreateCart(userId);
        return this.serialize(cart);
    }
    async addItem(userId, input) {
        if (input.designId) {
            const design = await prisma_1.prisma.design.findFirst({
                where: { id: input.designId, userId },
            });
            if (!design)
                throw apiError_1.ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
            if (design.productId !== input.productId) {
                throw apiError_1.ApiError.badRequest('Design was made for a different product', 'DESIGN_PRODUCT_MISMATCH');
            }
        }
        const cart = await this.getOrCreateCart(userId);
        const breakdown = await this.priceLine(input.productId, input.variantId ?? null, input.designId ?? null, input.quantity);
        await prisma_1.prisma.cartItem.create({
            data: {
                cartId: cart.id,
                productId: input.productId,
                variantId: input.variantId ?? null,
                designId: input.designId ?? null,
                quantity: input.quantity,
                unitPrice: new client_1.Prisma.Decimal(breakdown.unitPrice),
                totalPrice: new client_1.Prisma.Decimal(breakdown.totalPrice),
            },
        });
        return this.getCart(userId);
    }
    async updateItem(userId, itemId, quantity) {
        const cart = await this.getOrCreateCart(userId);
        const item = await prisma_1.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
        if (!item)
            throw apiError_1.ApiError.notFound('Cart item not found', 'CART_ITEM_NOT_FOUND');
        const breakdown = await this.priceLine(item.productId, item.variantId, item.designId, quantity);
        await prisma_1.prisma.cartItem.update({
            where: { id: itemId },
            data: {
                quantity,
                unitPrice: new client_1.Prisma.Decimal(breakdown.unitPrice),
                totalPrice: new client_1.Prisma.Decimal(breakdown.totalPrice),
            },
        });
        return this.getCart(userId);
    }
    async removeItem(userId, itemId) {
        const cart = await this.getOrCreateCart(userId);
        const item = await prisma_1.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
        if (!item)
            throw apiError_1.ApiError.notFound('Cart item not found', 'CART_ITEM_NOT_FOUND');
        await prisma_1.prisma.cartItem.delete({ where: { id: itemId } });
        return this.getCart(userId);
    }
    async clear(userId) {
        const cart = await this.getOrCreateCart(userId);
        await prisma_1.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        return this.getCart(userId);
    }
    serialize(cart) {
        const items = cart.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unitPrice: (0, misc_1.dec)(item.unitPrice),
            totalPrice: (0, misc_1.dec)(item.totalPrice),
            product: {
                id: item.product.id,
                name: item.product.name,
                slug: item.product.slug,
                image: item.product.images[0]?.url ?? null,
            },
            variant: item.variant
                ? {
                    id: item.variant.id,
                    name: item.variant.name,
                    color: item.variant.color,
                    colorName: item.variant.colorName,
                    size: item.variant.size,
                }
                : null,
            design: item.design,
        }));
        const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
        return { id: cart.id, items, subtotal: Math.round(subtotal * 100) / 100 };
    }
}
exports.CartService = CartService;
exports.cartService = new CartService();
//# sourceMappingURL=cart.service.js.map