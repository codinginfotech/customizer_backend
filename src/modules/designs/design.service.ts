import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { DesignDocument } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { storage } from '../../storage';
import { ApiError } from '../../utils/apiError';
import { logger } from '../../config/logger';
import { createDesignSchema, updateDesignSchema } from './design.validators';

type CreateInput = z.infer<typeof createDesignSchema>;
type UpdateInput = z.infer<typeof updateDesignSchema>;

/** Decode a data-URL preview, normalize it with Sharp, persist to storage. */
export async function storePreview(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buffer = Buffer.from(base64, 'base64');
  // Re-encode through Sharp: caps dimensions and strips anything malicious.
  const processed = await sharp(buffer)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `previews/${crypto.randomUUID()}.webp`;
  const stored = await storage.save(key, processed, 'image/webp');
  return stored.url;
}

export class DesignService {
  async list(userId: number, page: number, pageSize: number) {
    const where = { userId };
    const [items, total] = await prisma.$transaction([
      prisma.design.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true, slug: true } },
          _count: { select: { versions: true } },
        },
      }),
      prisma.design.count({ where }),
    ]);
    return { items, total };
  }

  async getOwned(id: number, userId: number, isAdmin = false) {
    const design = await prisma.design.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        versions: { orderBy: { version: 'desc' }, take: 10, select: { id: true, version: true, previewImage: true, createdAt: true } },
      },
    });
    if (!design) throw ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
    if (design.userId !== userId && !isAdmin) {
      throw ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
    }
    return design;
  }

  async create(userId: number, input: CreateInput) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || product.status !== 'ACTIVE') {
      throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    if (input.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: input.variantId, productId: input.productId },
      });
      if (!variant) throw ApiError.badRequest('Variant does not belong to product', 'VARIANT_MISMATCH');
    }

    const previewImage = input.previewImage ? await storePreview(input.previewImage) : null;
    const design = await prisma.design.create({
      data: {
        userId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        name: input.name,
        designJson: input.designJson as unknown as Prisma.InputJsonValue,
        previewImage,
      },
    });
    logger.info('design.created', { designId: design.id, userId });
    return design;
  }

  async update(id: number, userId: number, input: UpdateInput) {
    const existing = await this.getOwned(id, userId);

    if (input.createVersion) {
      const last = await prisma.designVersion.findFirst({
        where: { designId: id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await prisma.designVersion.create({
        data: {
          designId: id,
          version: (last?.version ?? 0) + 1,
          designJson: existing.designJson as Prisma.InputJsonValue,
          previewImage: existing.previewImage,
        },
      });
    }

    const previewImage = input.previewImage ? await storePreview(input.previewImage) : undefined;
    return prisma.design.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
        ...(input.designJson !== undefined
          ? { designJson: input.designJson as unknown as Prisma.InputJsonValue }
          : {}),
        ...(previewImage !== undefined ? { previewImage } : {}),
      },
    });
  }

  async duplicate(id: number, userId: number) {
    const source = await this.getOwned(id, userId);
    return prisma.design.create({
      data: {
        userId,
        productId: source.productId,
        variantId: source.variantId,
        name: `${source.name} (copy)`.slice(0, 160),
        designJson: source.designJson as Prisma.InputJsonValue,
        previewImage: source.previewImage,
      },
    });
  }

  async remove(id: number, userId: number) {
    await this.getOwned(id, userId);
    await prisma.design.delete({ where: { id } });
  }

  /** Explicit named snapshot (POST /designs/:id/versions). */
  async createVersion(id: number, userId: number) {
    const design = await this.getOwned(id, userId);
    const last = await prisma.designVersion.findFirst({
      where: { designId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return prisma.designVersion.create({
      data: {
        designId: id,
        version: (last?.version ?? 0) + 1,
        designJson: design.designJson as Prisma.InputJsonValue,
        previewImage: design.previewImage,
      },
    });
  }

  async getVersion(designId: number, versionId: number, userId: number) {
    await this.getOwned(designId, userId);
    const version = await prisma.designVersion.findFirst({
      where: { id: versionId, designId },
    });
    if (!version) throw ApiError.notFound('Version not found', 'VERSION_NOT_FOUND');
    return version;
  }

  /** Used by orders to freeze the design at purchase time. */
  getDocument(designJson: Prisma.JsonValue): DesignDocument {
    return designJson as unknown as DesignDocument;
  }

  /**
   * Public sharing: an opaque token gates read-only access. Only the owner
   * can enable/disable it; disabling immediately invalidates the old link.
   */
  async setShared(id: number, userId: number, enabled: boolean) {
    await this.getOwned(id, userId);
    const shareToken = enabled ? crypto.randomBytes(24).toString('base64url') : null;
    await prisma.design.update({ where: { id }, data: { shareToken } });
    return { shareToken };
  }

  async getPublicByToken(token: string) {
    const design = await prisma.design.findUnique({
      where: { shareToken: token },
      include: { product: { select: { id: true, name: true, slug: true, status: true } } },
    });
    if (!design || design.product.status !== 'ACTIVE') {
      throw ApiError.notFound('This shared design is unavailable', 'SHARED_DESIGN_NOT_FOUND');
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

export const designService = new DesignService();
