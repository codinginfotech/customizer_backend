"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = exports.ProductService = void 0;
exports.serializeProduct = serializeProduct;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const misc_1 = require("../../utils/misc");
const product_repository_1 = require("./product.repository");
/** Shape sent to clients — decimals become numbers, JSON stays JSON. */
function serializeProduct(p) {
    return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePrice: (0, misc_1.dec)(p.basePrice),
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
            price: v.price === null ? null : (0, misc_1.dec)(v.price),
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
            physicalWidthIn: a.physicalWidthIn === null ? null : (0, misc_1.dec)(a.physicalWidthIn),
            physicalHeightIn: a.physicalHeightIn === null ? null : (0, misc_1.dec)(a.physicalHeightIn),
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
const SORT_MAP = {
    newest: { createdAt: 'desc' },
    price_asc: { basePrice: 'asc' },
    price_desc: { basePrice: 'desc' },
    name: { name: 'asc' },
};
class ProductService {
    async list(query, includeInactive = false) {
        const where = {
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
        const [items, total] = await product_repository_1.productRepository.findMany(where, SORT_MAP[query.sort], skip, query.pageSize);
        return {
            items: items.map(serializeProduct),
            total,
            page: query.page,
            pageSize: query.pageSize,
        };
    }
    async getBySlug(slug, includeInactive = false) {
        const product = await product_repository_1.productRepository.findBySlug(slug);
        if (!product || (!includeInactive && product.status !== 'ACTIVE')) {
            throw apiError_1.ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
        }
        return serializeProduct(product);
    }
    async getById(id) {
        const product = await product_repository_1.productRepository.findById(id);
        if (!product)
            throw apiError_1.ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
        return serializeProduct(product);
    }
    async create(input) {
        const product = await product_repository_1.productRepository.create({
            name: input.name,
            slug: input.slug || (0, misc_1.slugify)(input.name),
            description: input.description,
            basePrice: new client_1.Prisma.Decimal(input.basePrice),
            pricingRules: (input.pricingRules ?? undefined),
            tags: (input.tags ?? undefined),
            metadata: (input.metadata ?? undefined),
            printMethods: (input.printMethods ?? undefined),
            productionRules: (input.productionRules ?? undefined),
            featured: input.featured,
            status: input.status,
            category: { connect: { id: input.categoryId } },
        });
        return serializeProduct(product);
    }
    async update(id, input) {
        await this.getById(id);
        const product = await product_repository_1.productRepository.update(id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.basePrice !== undefined ? { basePrice: new client_1.Prisma.Decimal(input.basePrice) } : {}),
            ...(input.pricingRules !== undefined
                ? { pricingRules: input.pricingRules }
                : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
            ...(input.printMethods !== undefined
                ? { printMethods: input.printMethods }
                : {}),
            ...(input.productionRules !== undefined
                ? { productionRules: input.productionRules }
                : {}),
            ...(input.featured !== undefined ? { featured: input.featured } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.categoryId !== undefined ? { category: { connect: { id: input.categoryId } } } : {}),
            // Product versioning: every admin edit bumps the version; historical
            // orders keep their own snapshots and are never affected.
            version: { increment: 1 },
        });
        return serializeProduct(product);
    }
    async remove(id) {
        const inOrders = await prisma_1.prisma.orderItem.count({ where: { productId: id } });
        if (inOrders > 0) {
            // Never hard-delete purchased products — archive instead.
            await product_repository_1.productRepository.update(id, { status: 'INACTIVE' });
            return { archived: true };
        }
        await product_repository_1.productRepository.delete(id);
        return { deleted: true };
    }
    // ---- variants ----
    async addVariant(productId, input) {
        await this.getById(productId);
        return prisma_1.prisma.productVariant.create({
            data: {
                productId,
                name: input.name,
                color: input.color ?? null,
                colorName: input.colorName ?? null,
                size: input.size ?? null,
                material: input.material ?? null,
                sku: input.sku,
                price: input.price === null || input.price === undefined ? null : new client_1.Prisma.Decimal(input.price),
                stock: input.stock,
                status: input.status,
            },
        });
    }
    async updateVariant(productId, variantId, input) {
        const variant = await prisma_1.prisma.productVariant.findFirst({
            where: { id: variantId, productId },
        });
        if (!variant)
            throw apiError_1.ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');
        return prisma_1.prisma.productVariant.update({
            where: { id: variantId },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.color !== undefined ? { color: input.color } : {}),
                ...(input.colorName !== undefined ? { colorName: input.colorName } : {}),
                ...(input.size !== undefined ? { size: input.size } : {}),
                ...(input.material !== undefined ? { material: input.material } : {}),
                ...(input.sku !== undefined ? { sku: input.sku } : {}),
                ...(input.price !== undefined
                    ? { price: input.price === null ? null : new client_1.Prisma.Decimal(input.price) }
                    : {}),
                ...(input.stock !== undefined ? { stock: input.stock } : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
            },
        });
    }
    async removeVariant(productId, variantId) {
        const variant = await prisma_1.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
        if (!variant)
            throw apiError_1.ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');
        await prisma_1.prisma.productVariant.delete({ where: { id: variantId } });
    }
    // ---- print areas ----
    async addPrintArea(productId, input) {
        await this.getById(productId);
        const dup = await prisma_1.prisma.productPrintArea.findFirst({
            where: { productId, key: input.key },
        });
        if (dup)
            throw apiError_1.ApiError.conflict('An area with this key already exists', 'AREA_KEY_TAKEN');
        return prisma_1.prisma.productPrintArea.create({
            data: {
                productId,
                key: input.key,
                name: input.name,
                width: input.width,
                height: input.height,
                maxDesignWidth: input.maxDesignWidth ?? null,
                maxDesignHeight: input.maxDesignHeight ?? null,
                bleed: input.bleed,
                safeArea: input.safeArea,
                physicalWidthIn: input.physicalWidthIn === null || input.physicalWidthIn === undefined
                    ? null
                    : new client_1.Prisma.Decimal(input.physicalWidthIn),
                physicalHeightIn: input.physicalHeightIn === null || input.physicalHeightIn === undefined
                    ? null
                    : new client_1.Prisma.Decimal(input.physicalHeightIn),
                mockup: (input.mockup ?? undefined),
                templateImage: input.templateImage ?? null,
                modelMeshName: input.modelMeshName ?? null,
                textureConfig: (input.textureConfig ?? undefined),
                sortOrder: input.sortOrder,
            },
        });
    }
    async updatePrintArea(productId, areaId, input) {
        const area = await prisma_1.prisma.productPrintArea.findFirst({ where: { id: areaId, productId } });
        if (!area)
            throw apiError_1.ApiError.notFound('Print area not found', 'AREA_NOT_FOUND');
        return prisma_1.prisma.productPrintArea.update({
            where: { id: areaId },
            data: {
                ...(input.key !== undefined ? { key: input.key } : {}),
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.width !== undefined ? { width: input.width } : {}),
                ...(input.height !== undefined ? { height: input.height } : {}),
                ...(input.maxDesignWidth !== undefined ? { maxDesignWidth: input.maxDesignWidth } : {}),
                ...(input.maxDesignHeight !== undefined ? { maxDesignHeight: input.maxDesignHeight } : {}),
                ...(input.bleed !== undefined ? { bleed: input.bleed } : {}),
                ...(input.safeArea !== undefined ? { safeArea: input.safeArea } : {}),
                ...(input.physicalWidthIn !== undefined
                    ? {
                        physicalWidthIn: input.physicalWidthIn === null ? null : new client_1.Prisma.Decimal(input.physicalWidthIn),
                    }
                    : {}),
                ...(input.physicalHeightIn !== undefined
                    ? {
                        physicalHeightIn: input.physicalHeightIn === null ? null : new client_1.Prisma.Decimal(input.physicalHeightIn),
                    }
                    : {}),
                ...(input.mockup !== undefined
                    ? { mockup: (input.mockup ?? client_1.Prisma.JsonNull) }
                    : {}),
                ...(input.templateImage !== undefined ? { templateImage: input.templateImage } : {}),
                ...(input.modelMeshName !== undefined ? { modelMeshName: input.modelMeshName } : {}),
                ...(input.textureConfig !== undefined
                    ? { textureConfig: (input.textureConfig ?? client_1.Prisma.JsonNull) }
                    : {}),
                ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            },
        });
    }
    async removePrintArea(productId, areaId) {
        const area = await prisma_1.prisma.productPrintArea.findFirst({ where: { id: areaId, productId } });
        if (!area)
            throw apiError_1.ApiError.notFound('Print area not found', 'AREA_NOT_FOUND');
        await prisma_1.prisma.productPrintArea.delete({ where: { id: areaId } });
    }
    // ---- images ----
    async addImage(productId, input) {
        await this.getById(productId);
        if (input.isPrimary) {
            await prisma_1.prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
        }
        return prisma_1.prisma.productImage.create({ data: { productId, ...input } });
    }
    async removeImage(productId, imageId) {
        const image = await prisma_1.prisma.productImage.findFirst({ where: { id: imageId, productId } });
        if (!image)
            throw apiError_1.ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
        await prisma_1.prisma.productImage.delete({ where: { id: imageId } });
    }
    // ---- 3D model ----
    async upsertModel(productId, input) {
        await this.getById(productId);
        const validationFields = input.validation
            ? {
                validation: input.validation,
                qualityScore: Math.round(input.validation.score),
            }
            : {};
        return prisma_1.prisma.productModel.upsert({
            where: { productId },
            create: {
                productId,
                modelUrl: input.modelUrl ?? null,
                thumbnailUrl: input.thumbnailUrl ?? null,
                modelType: input.modelType,
                configuration: input.configuration,
                ...validationFields,
            },
            update: {
                modelUrl: input.modelUrl ?? null,
                thumbnailUrl: input.thumbnailUrl ?? null,
                modelType: input.modelType,
                configuration: input.configuration,
                ...validationFields,
            },
        });
    }
    async removeModel(productId) {
        await prisma_1.prisma.productModel.deleteMany({ where: { productId } });
    }
}
exports.ProductService = ProductService;
exports.productService = new ProductService();
//# sourceMappingURL=product.service.js.map