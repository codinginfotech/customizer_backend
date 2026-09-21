import { Prisma } from '@prisma/client';
import { DesignDocument } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { dec } from '../../utils/misc';
import { pricingService } from '../pricing/pricing.service';

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
} satisfies Prisma.CartInclude;

export class CartService {
  private async getOrCreateCart(userId: number) {
    return prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: cartInclude,
    });
  }

  /** Re-price a line item from source data — never trust the client. */
  private async priceLine(
    productId: number,
    variantId: number | null,
    designId: number | null,
    quantity: number,
  ) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') {
      throw ApiError.notFound('Product is unavailable', 'PRODUCT_NOT_FOUND');
    }
    let basePrice = dec(product.basePrice);
    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId, status: 'ACTIVE' },
      });
      if (!variant) throw ApiError.badRequest('Variant is unavailable', 'VARIANT_MISMATCH');
      if (variant.price !== null) basePrice = dec(variant.price);
    }
    let design: DesignDocument | null = null;
    if (designId) {
      const record = await prisma.design.findUnique({ where: { id: designId } });
      if (!record) throw ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
      design = record.designJson as unknown as DesignDocument;
    }
    const rules = pricingService.resolveRules(product.pricingRules);
    return pricingService.quote(basePrice, rules, design, quantity);
  }

  async getCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    return this.serialize(cart);
  }

  async addItem(
    userId: number,
    input: { productId: number; variantId?: number | null; designId?: number | null; quantity: number },
  ) {
    if (input.designId) {
      const design = await prisma.design.findFirst({
        where: { id: input.designId, userId },
      });
      if (!design) throw ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
      if (design.productId !== input.productId) {
        throw ApiError.badRequest('Design was made for a different product', 'DESIGN_PRODUCT_MISMATCH');
      }
    }

    const cart = await this.getOrCreateCart(userId);
    const breakdown = await this.priceLine(
      input.productId,
      input.variantId ?? null,
      input.designId ?? null,
      input.quantity,
    );

    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variantId: input.variantId ?? null,
        designId: input.designId ?? null,
        quantity: input.quantity,
        unitPrice: new Prisma.Decimal(breakdown.unitPrice),
        totalPrice: new Prisma.Decimal(breakdown.totalPrice),
      },
    });
    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw ApiError.notFound('Cart item not found', 'CART_ITEM_NOT_FOUND');

    const breakdown = await this.priceLine(item.productId, item.variantId, item.designId, quantity);
    await prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity,
        unitPrice: new Prisma.Decimal(breakdown.unitPrice),
        totalPrice: new Prisma.Decimal(breakdown.totalPrice),
      },
    });
    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw ApiError.notFound('Cart item not found', 'CART_ITEM_NOT_FOUND');
    await prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  private serialize(cart: Prisma.CartGetPayload<{ include: typeof cartInclude }>) {
    const items = cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: dec(item.unitPrice),
      totalPrice: dec(item.totalPrice),
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

export const cartService = new CartService();
