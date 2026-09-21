"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.designService = exports.DesignService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const sharp_1 = __importDefault(require("sharp"));
const prisma_1 = require("../../lib/prisma");
const storage_1 = require("../../storage");
const apiError_1 = require("../../utils/apiError");
const logger_1 = require("../../config/logger");
/** Decode a data-URL preview, normalize it with Sharp, persist to storage. */
async function storePreview(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const buffer = Buffer.from(base64, 'base64');
    // Re-encode through Sharp: caps dimensions and strips anything malicious.
    const processed = await (0, sharp_1.default)(buffer)
        .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    const key = `previews/${node_crypto_1.default.randomUUID()}.webp`;
    const stored = await storage_1.storage.save(key, processed, 'image/webp');
    return stored.url;
}
class DesignService {
    async list(userId, page, pageSize) {
        const where = { userId };
        const [items, total] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.design.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    product: { select: { id: true, name: true, slug: true } },
                    _count: { select: { versions: true } },
                },
            }),
            prisma_1.prisma.design.count({ where }),
        ]);
        return { items, total };
    }
    async getOwned(id, userId, isAdmin = false) {
        const design = await prisma_1.prisma.design.findUnique({
            where: { id },
            include: {
                product: { select: { id: true, name: true, slug: true } },
                versions: { orderBy: { version: 'desc' }, take: 10, select: { id: true, version: true, previewImage: true, createdAt: true } },
            },
        });
        if (!design)
            throw apiError_1.ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
        if (design.userId !== userId && !isAdmin) {
            throw apiError_1.ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
        }
        return design;
    }
    async create(userId, input) {
        const product = await prisma_1.prisma.product.findUnique({ where: { id: input.productId } });
        if (!product || product.status !== 'ACTIVE') {
            throw apiError_1.ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
        }
        if (input.variantId) {
            const variant = await prisma_1.prisma.productVariant.findFirst({
                where: { id: input.variantId, productId: input.productId },
            });
            if (!variant)
                throw apiError_1.ApiError.badRequest('Variant does not belong to product', 'VARIANT_MISMATCH');
        }
        const previewImage = input.previewImage ? await storePreview(input.previewImage) : null;
        const design = await prisma_1.prisma.design.create({
            data: {
                userId,
                productId: input.productId,
                variantId: input.variantId ?? null,
                name: input.name,
                designJson: input.designJson,
                previewImage,
            },
        });
        logger_1.logger.info('design.created', { designId: design.id, userId });
        return design;
    }
    async update(id, userId, input) {
        const existing = await this.getOwned(id, userId);
        if (input.createVersion) {
            const last = await prisma_1.prisma.designVersion.findFirst({
                where: { designId: id },
                orderBy: { version: 'desc' },
                select: { version: true },
            });
            await prisma_1.prisma.designVersion.create({
                data: {
                    designId: id,
                    version: (last?.version ?? 0) + 1,
                    designJson: existing.designJson,
                    previewImage: existing.previewImage,
                },
            });
        }
        const previewImage = input.previewImage ? await storePreview(input.previewImage) : undefined;
        return prisma_1.prisma.design.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
                ...(input.designJson !== undefined
                    ? { designJson: input.designJson }
                    : {}),
                ...(previewImage !== undefined ? { previewImage } : {}),
            },
        });
    }
    async duplicate(id, userId) {
        const source = await this.getOwned(id, userId);
        return prisma_1.prisma.design.create({
            data: {
                userId,
                productId: source.productId,
                variantId: source.variantId,
                name: `${source.name} (copy)`.slice(0, 160),
                designJson: source.designJson,
                previewImage: source.previewImage,
            },
        });
    }
    async remove(id, userId) {
        await this.getOwned(id, userId);
        await prisma_1.prisma.design.delete({ where: { id } });
    }
    /** Explicit named snapshot (POST /designs/:id/versions). */
    async createVersion(id, userId) {
        const design = await this.getOwned(id, userId);
        const last = await prisma_1.prisma.designVersion.findFirst({
            where: { designId: id },
            orderBy: { version: 'desc' },
            select: { version: true },
        });
        return prisma_1.prisma.designVersion.create({
            data: {
                designId: id,
                version: (last?.version ?? 0) + 1,
                designJson: design.designJson,
                previewImage: design.previewImage,
            },
        });
    }
    async getVersion(designId, versionId, userId) {
        await this.getOwned(designId, userId);
        const version = await prisma_1.prisma.designVersion.findFirst({
            where: { id: versionId, designId },
        });
        if (!version)
            throw apiError_1.ApiError.notFound('Version not found', 'VERSION_NOT_FOUND');
        return version;
    }
    /** Used by orders to freeze the design at purchase time. */
    getDocument(designJson) {
        return designJson;
    }
    /**
     * Public sharing: an opaque token gates read-only access. Only the owner
     * can enable/disable it; disabling immediately invalidates the old link.
     */
    async setShared(id, userId, enabled) {
        await this.getOwned(id, userId);
        const shareToken = enabled ? node_crypto_1.default.randomBytes(24).toString('base64url') : null;
        await prisma_1.prisma.design.update({ where: { id }, data: { shareToken } });
        return { shareToken };
    }
    async getPublicByToken(token) {
        const design = await prisma_1.prisma.design.findUnique({
            where: { shareToken: token },
            include: { product: { select: { id: true, name: true, slug: true, status: true } } },
        });
        if (!design || design.product.status !== 'ACTIVE') {
            throw apiError_1.ApiError.notFound('This shared design is unavailable', 'SHARED_DESIGN_NOT_FOUND');
        }
        // Read-only public payload — no owner identity beyond first name-less data.
        return {
            name: design.name,
            previewImage: design.previewImage,
            designJson: design.designJson,
            product: { id: design.product.id, name: design.product.name, slug: design.product.slug },
        };
    }
}
exports.DesignService = DesignService;
exports.designService = new DesignService();
//# sourceMappingURL=design.service.js.map