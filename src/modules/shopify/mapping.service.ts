import { Prisma, type ShopifyShop } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { logger } from '../../config/logger';
import { shopService } from './shop.service';
import { gidToId, toGid } from './shopify.client';

export interface ShopifyVariantSummary {
  id: string;
  title: string;
  options: Array<{ name: string; value: string }>;
}

export interface ShopifyProductSummary {
  id: string;
  title: string;
  handle: string;
  status: string;
  imageUrl: string | null;
  variants: ShopifyVariantSummary[];
}

interface CustomizerVariantLike {
  id: number;
  name: string;
  colorName: string | null;
  size: string | null;
  status?: string;
}

const PRODUCTS_QUERY = `#graphql
  query CpdProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        featuredMedia { preview { image { url } } }
        variants(first: 100) {
          nodes { id title selectedOptions { name value } }
        }
      }
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  query CpdProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      featuredMedia { preview { image { url } } }
      variants(first: 100) {
        nodes { id title selectedOptions { name value } }
      }
    }
  }
`;

interface GqlProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: { nodes: Array<{ id: string; title: string; selectedOptions: Array<{ name: string; value: string }> }> };
}

function summarize(p: GqlProduct): ShopifyProductSummary {
  return {
    id: gidToId(p.id) ?? p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
    variants: p.variants.nodes.map((v) => ({
      id: gidToId(v.id) ?? v.id,
      title: v.title,
      options: v.selectedOptions,
    })),
  };
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Best-effort Shopify variant → customizer variant match by option values
 * (colour and size names), so "Black / M" on Shopify lands on the black
 * medium variant in the customizer. Pure so it can be unit-tested.
 */
export function autoMatchVariants(
  shopifyVariants: ShopifyVariantSummary[],
  customizerVariants: CustomizerVariantLike[],
): Record<string, number> {
  const active = customizerVariants.filter((v) => !v.status || v.status === 'ACTIVE');
  const map: Record<string, number> = {};
  for (const sv of shopifyVariants) {
    const values = new Set(sv.options.map((o) => norm(o.value)));
    const title = norm(sv.title);
    const score = (cv: CustomizerVariantLike) => {
      let s = 0;
      if (cv.colorName && values.has(norm(cv.colorName))) s += 2;
      if (cv.size && values.has(norm(cv.size))) s += 1;
      if (s === 0 && cv.colorName && title.includes(norm(cv.colorName))) s += 1;
      return s;
    };
    let best: { id: number; s: number } | null = null;
    for (const cv of active) {
      const s = score(cv);
      if (s > 0 && (!best || s > best.s)) best = { id: cv.id, s };
    }
    if (best) map[sv.id] = best.id;
  }
  return map;
}

export class MappingService {
  async listShopifyProducts(shop: ShopifyShop, params: { after?: string; query?: string; first?: number }) {
    const data = await shopService.graphql<{
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlProduct[] };
    }>(shop, PRODUCTS_QUERY, {
      first: Math.min(50, Math.max(1, params.first ?? 25)),
      after: params.after || null,
      query: params.query ? `title:*${params.query.replace(/["*]/g, '')}*` : null,
    });
    const products = data.products.nodes.map(summarize);
    const mappings = await prisma.shopifyProductMapping.findMany({
      where: { shopId: shop.id, shopifyProductId: { in: products.map((p) => p.id) } },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
    const byId = new Map(mappings.map((m) => [m.shopifyProductId, m]));
    return {
      items: products.map((p) => ({ ...p, mapping: byId.get(p.id) ?? null })),
      pageInfo: data.products.pageInfo,
    };
  }

  async getShopifyProduct(shop: ShopifyShop, shopifyProductId: string) {
    const data = await shopService.graphql<{ product: GqlProduct | null }>(shop, PRODUCT_QUERY, {
      id: toGid('Product', shopifyProductId),
    });
    if (!data.product) throw ApiError.notFound('Shopify product not found', 'SHOPIFY_PRODUCT_NOT_FOUND');
    return summarize(data.product);
  }

  async listMappings(shopId: number) {
    return prisma.shopifyProductMapping.findMany({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
  }

  async findMapping(shopId: number, shopifyProductId: string) {
    return prisma.shopifyProductMapping.findUnique({
      where: { shopId_shopifyProductId: { shopId, shopifyProductId } },
      include: {
        product: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
  }

  /** Link (or re-link) a Shopify product to a customizer product. */
  async upsertMapping(
    shop: ShopifyShop,
    shopifyProductId: string,
    productId: number,
    options: { variantMap?: Record<string, number>; enabled?: boolean } = {},
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });
    if (!product || product.status !== 'ACTIVE') {
      throw ApiError.notFound('Customizer product not found', 'PRODUCT_NOT_FOUND');
    }
    const shopifyProduct = await this.getShopifyProduct(shop, shopifyProductId);

    let variantMap = options.variantMap;
    if (!variantMap) {
      variantMap = autoMatchVariants(shopifyProduct.variants, product.variants);
    } else {
      // Only accept variant ids that really belong to this product.
      const valid = new Set(product.variants.map((v) => v.id));
      variantMap = Object.fromEntries(Object.entries(variantMap).filter(([, id]) => valid.has(Number(id))));
    }

    const data = {
      shopifyProductTitle: shopifyProduct.title.slice(0, 255),
      shopifyHandle: shopifyProduct.handle.slice(0, 255),
      productId,
      variantMap: variantMap as Prisma.InputJsonValue,
      enabled: options.enabled ?? true,
    };
    const mapping = await prisma.shopifyProductMapping.upsert({
      where: { shopId_shopifyProductId: { shopId: shop.id, shopifyProductId } },
      create: { shopId: shop.id, shopifyProductId, ...data },
      update: data,
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
    logger.info('shopify.mapping_saved', { shop: shop.shopDomain, shopifyProductId, productId });
    return mapping;
  }

  async setEnabled(shopId: number, shopifyProductId: string, enabled: boolean) {
    const existing = await this.findMapping(shopId, shopifyProductId);
    if (!existing) throw ApiError.notFound('Mapping not found', 'SHOPIFY_MAPPING_NOT_FOUND');
    return prisma.shopifyProductMapping.update({
      where: { id: existing.id },
      data: { enabled },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
  }

  async removeMapping(shopId: number, shopifyProductId: string) {
    const existing = await this.findMapping(shopId, shopifyProductId);
    if (!existing) return;
    await prisma.shopifyProductMapping.delete({ where: { id: existing.id } });
  }

  /** Customizer variant for a Shopify variant, if the merchant mapped one. */
  resolveVariantId(mapping: { variantMap: Prisma.JsonValue }, shopifyVariantId: string | null): number | null {
    if (!shopifyVariantId || !mapping.variantMap || typeof mapping.variantMap !== 'object') return null;
    const value = (mapping.variantMap as Record<string, unknown>)[shopifyVariantId];
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }
}

export const mappingService = new MappingService();
