import { Prisma, Product, ProductVariant, ProductPrintArea, ProductImage, ProductModel, Category } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { dec, slugify } from '../../utils/misc';
import { productRepository } from './product.repository';
import {
  createProductSchema,
  listProductsQuerySchema,
  printAreaSchema,
  productImageSchema,
  productModelSchema,
  updateProductSchema,
  variantSchema,
} from './product.validators';

type ListQuery = z.infer<typeof listProductsQuerySchema>;
type CreateInput = z.infer<typeof createProductSchema>;
type UpdateInput = z.infer<typeof updateProductSchema>;
type VariantInput = z.infer<typeof variantSchema>;
type PrintAreaInput = z.infer<typeof printAreaSchema>;
type ImageInput = z.infer<typeof productImageSchema>;
type ModelInput = z.infer<typeof productModelSchema>;

type FullProduct = Product & {
  category: Pick<Category, 'id' | 'name' | 'slug'>;
  images: ProductImage[];
  variants: ProductVariant[];
  printAreas: ProductPrintArea[];
  model: ProductModel | null;
};

/** Shape sent to clients — decimals become numbers, JSON stays JSON. */
export function serializeProduct(p: FullProduct) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    basePrice: dec(p.basePrice),
    pricingRules: p.pricingRules,
    tags: p.tags ?? [],
    metadata: p.metadata ?? null,
    printMethods: p.printMethods ?? [],
    productionRules: p.productionRules ?? null,
    version: p.version,
    featured: p.featured,
    status: p.status,
    category: p.category,
    createdAt: p.createdAt,
    images: p.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      isPrimary: i.isPrimary,
      sortOrder: i.sortOrder,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      color: v.color,
      colorName: v.colorName,
      size: v.size,
      material: v.material,
      sku: v.sku,
      price: v.price === null ? null : dec(v.price),
      stock: v.stock,
      status: v.status,
    })),
    printAreas: p.printAreas.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      width: a.width,
      height: a.height,
      maxDesignWidth: a.maxDesignWidth,
      maxDesignHeight: a.maxDesignHeight,
      bleed: a.bleed,
      safeArea: a.safeArea,
      physicalWidthIn: a.physicalWidthIn === null ? null : dec(a.physicalWidthIn),
      physicalHeightIn: a.physicalHeightIn === null ? null : dec(a.physicalHeightIn),
      mockup: a.mockup,
      templateImage: a.templateImage,
      modelMeshName: a.modelMeshName,
      textureConfig: a.textureConfig,
      sortOrder: a.sortOrder,
    })),
    model: p.model
      ? {
          id: p.model.id,
          modelUrl: p.model.modelUrl,
          thumbnailUrl: p.model.thumbnailUrl,
          modelType: p.model.modelType,
          configuration: p.model.configuration,
          validation: p.model.validation ?? null,
          qualityScore: p.model.qualityScore ?? null,
        }
      : null,
  };
}
export type SerializedProduct = ReturnType<typeof serializeProduct>;

const SORT_MAP: Record<ListQuery['sort'], Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  price_asc: { basePrice: 'asc' },
  price_desc: { basePrice: 'desc' },
  name: { name: 'asc' },
};

export class ProductService {
  async list(query: ListQuery, includeInactive = false) {
    const where: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { description: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.featured !== undefined ? { featured: query.featured } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            basePrice: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await productRepository.findMany(
      where,
      SORT_MAP[query.sort],
      skip,
      query.pageSize,
    );
    return {
      items: (items as FullProduct[]).map(serializeProduct),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getBySlug(slug: string, includeInactive = false) {
    const product = await productRepository.findBySlug(slug);
    if (!product || (!includeInactive && product.status !== 'ACTIVE')) {
      throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    return serializeProduct(product as FullProduct);
  }

  async getById(id: number) {
    const product = await productRepository.findById(id);
    if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    return serializeProduct(product as FullProduct);
  }

  async create(input: CreateInput) {
    const product = await productRepository.create({
      name: input.name,
      slug: input.slug || slugify(input.name),
      description: input.description,
      basePrice: new Prisma.Decimal(input.basePrice),
      pricingRules: (input.pricingRules ?? undefined) as Prisma.InputJsonValue | undefined,
      tags: (input.tags ?? undefined) as Prisma.InputJsonValue | undefined,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      printMethods: (input.printMethods ?? undefined) as Prisma.InputJsonValue | undefined,
      productionRules: (input.productionRules ?? undefined) as Prisma.InputJsonValue | undefined,
      featured: input.featured,
      status: input.status,
      category: { connect: { id: input.categoryId } },
    });
    return serializeProduct(product as FullProduct);
  }

  async update(id: number, input: UpdateInput) {
    await this.getById(id);
    const product = await productRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.basePrice !== undefined ? { basePrice: new Prisma.Decimal(input.basePrice) } : {}),
      ...(input.pricingRules !== undefined
        ? { pricingRules: input.pricingRules as Prisma.InputJsonValue }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags as Prisma.InputJsonValue } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      ...(input.printMethods !== undefined
        ? { printMethods: input.printMethods as Prisma.InputJsonValue }
        : {}),
      ...(input.productionRules !== undefined
        ? { productionRules: input.productionRules as Prisma.InputJsonValue }
        : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.categoryId !== undefined ? { category: { connect: { id: input.categoryId } } } : {}),
      // Product versioning: every admin edit bumps the version; historical
      // orders keep their own snapshots and are never affected.
      version: { increment: 1 },
    });
    return serializeProduct(product as FullProduct);
  }

  async remove(id: number) {
    const inOrders = await prisma.orderItem.count({ where: { productId: id } });
    if (inOrders > 0) {
      // Never hard-delete purchased products — archive instead.
      await productRepository.update(id, { status: 'INACTIVE' });
      return { archived: true };
    }
    await productRepository.delete(id);
    return { deleted: true };
  }

  // ---- variants ----
  async addVariant(productId: number, input: VariantInput) {
    await this.getById(productId);
    return prisma.productVariant.create({
      data: {
        productId,
        name: input.name,
        color: input.color ?? null,
        colorName: input.colorName ?? null,
        size: input.size ?? null,
        material: input.material ?? null,
        sku: input.sku,
        price: input.price === null || input.price === undefined ? null : new Prisma.Decimal(input.price),
        stock: input.stock,
        status: input.status,
      },
    });
  }

  async updateVariant(productId: number, variantId: number, input: Partial<VariantInput>) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');
    return prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.colorName !== undefined ? { colorName: input.colorName } : {}),
        ...(input.size !== undefined ? { size: input.size } : {}),
        ...(input.material !== undefined ? { material: input.material } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.price !== undefined
          ? { price: input.price === null ? null : new Prisma.Decimal(input.price) }
          : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async removeVariant(productId: number, variantId: number) {
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');
    await prisma.productVariant.delete({ where: { id: variantId } });
  }

  // ---- print areas ----
  async addPrintArea(productId: number, input: PrintAreaInput) {
    await this.getById(productId);
    const dup = await prisma.productPrintArea.findFirst({
      where: { productId, key: input.key },
    });
    if (dup) throw ApiError.conflict('An area with this key already exists', 'AREA_KEY_TAKEN');
    return prisma.productPrintArea.create({
      data: {
        productId,
        key: input.key,
        name: input.name,
        width: input.width,
        height: input.height,
        maxDesignWidth: input.maxDesignWidth ?? null,
        maxDesignHeight: input.maxDesignHeight ?? null,
        bleed: input.bleed,
        safeArea: input.safeArea as Prisma.InputJsonValue,
        physicalWidthIn:
          input.physicalWidthIn === null || input.physicalWidthIn === undefined
            ? null
            : new Prisma.Decimal(input.physicalWidthIn),
        physicalHeightIn:
          input.physicalHeightIn === null || input.physicalHeightIn === undefined
            ? null
            : new Prisma.Decimal(input.physicalHeightIn),
        mockup: (input.mockup ?? undefined) as Prisma.InputJsonValue | undefined,
        templateImage: input.templateImage ?? null,
        modelMeshName: input.modelMeshName ?? null,
        textureConfig: (input.textureConfig ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: input.sortOrder,
      },
    });
  }

  async updatePrintArea(productId: number, areaId: number, input: Partial<PrintAreaInput>) {
    const area = await prisma.productPrintArea.findFirst({ where: { id: areaId, productId } });
    if (!area) throw ApiError.notFound('Print area not found', 'AREA_NOT_FOUND');
    return prisma.productPrintArea.update({
      where: { id: areaId },
      data: {
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.maxDesignWidth !== undefined ? { maxDesignWidth: input.maxDesignWidth } : {}),
        ...(input.maxDesignHeight !== undefined ? { maxDesignHeight: input.maxDesignHeight } : {}),
        ...(input.bleed !== undefined ? { bleed: input.bleed } : {}),
        ...(input.safeArea !== undefined ? { safeArea: input.safeArea as Prisma.InputJsonValue } : {}),
        ...(input.physicalWidthIn !== undefined
          ? {
              physicalWidthIn:
                input.physicalWidthIn === null ? null : new Prisma.Decimal(input.physicalWidthIn),
            }
          : {}),
        ...(input.physicalHeightIn !== undefined
          ? {
              physicalHeightIn:
                input.physicalHeightIn === null ? null : new Prisma.Decimal(input.physicalHeightIn),
            }
          : {}),
        ...(input.mockup !== undefined
          ? { mockup: (input.mockup ?? Prisma.JsonNull) as Prisma.InputJsonValue }
          : {}),
        ...(input.templateImage !== undefined ? { templateImage: input.templateImage } : {}),
        ...(input.modelMeshName !== undefined ? { modelMeshName: input.modelMeshName } : {}),
        ...(input.textureConfig !== undefined
          ? { textureConfig: (input.textureConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  async removePrintArea(productId: number, areaId: number) {
    const area = await prisma.productPrintArea.findFirst({ where: { id: areaId, productId } });
    if (!area) throw ApiError.notFound('Print area not found', 'AREA_NOT_FOUND');
    await prisma.productPrintArea.delete({ where: { id: areaId } });
  }

  // ---- images ----
  async addImage(productId: number, input: ImageInput) {
    await this.getById(productId);
    if (input.isPrimary) {
      await prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
    }
    return prisma.productImage.create({ data: { productId, ...input } });
  }

  async removeImage(productId: number, imageId: number) {
    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
    await prisma.productImage.delete({ where: { id: imageId } });
  }

  // ---- 3D model ----
  async upsertModel(productId: number, input: ModelInput) {
    await this.getById(productId);
    const validationFields = input.validation
      ? {
          validation: input.validation as unknown as Prisma.InputJsonValue,
          qualityScore: Math.round(input.validation.score),
        }
      : {};
    return prisma.productModel.upsert({
      where: { productId },
      create: {
        productId,
        modelUrl: input.modelUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        modelType: input.modelType,
        configuration: input.configuration as Prisma.InputJsonValue,
        ...validationFields,
      },
      update: {
        modelUrl: input.modelUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        modelType: input.modelType,
        configuration: input.configuration as Prisma.InputJsonValue,
        ...validationFields,
      },
    });
  }

  async removeModel(productId: number) {
    await prisma.productModel.deleteMany({ where: { productId } });
  }
}

export const productService = new ProductService();
