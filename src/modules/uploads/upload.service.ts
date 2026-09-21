import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma';
import { storage } from '../../storage';
import { ApiError } from '../../utils/apiError';
import { logger } from '../../config/logger';
import { validateModelBuffer } from '../models/modelValidation.service';

export interface ProcessedUpload {
  id: number;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  metadata: { width: number; height: number; format: string; hasAlpha: boolean } | null;
}

/**
 * SVG sanitization: strip script blocks, event handlers, foreignObject and
 * external references. Design uploads never execute in a privileged context
 * (they are drawn to canvas), but defense in depth costs little.
 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/xlink:href\s*=\s*["'](?!#|data:image\/)[^"']*["']/gi, '')
    .replace(/href\s*=\s*["'](?!#|data:image\/)[^"']*["']/gi, '');
}

export class UploadService {
  async processDesignAsset(userId: number, file: Express.Multer.File): Promise<ProcessedUpload> {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomUUID();

    let buffer: Buffer;
    let contentType: string;
    let key: string;
    let metadata: ProcessedUpload['metadata'] = null;

    if (ext === '.svg') {
      const raw = file.buffer.toString('utf8');
      if (raw.length > 2_000_000) throw ApiError.badRequest('SVG is too large', 'FILE_TOO_LARGE');
      if (!/<svg[\s>]/i.test(raw)) throw ApiError.badRequest('Not a valid SVG file', 'INVALID_SVG');
      buffer = Buffer.from(sanitizeSvg(raw), 'utf8');
      contentType = 'image/svg+xml';
      key = `assets/${userId}/${id}.svg`;
      try {
        const probe = await sharp(buffer).metadata();
        metadata = {
          width: probe.width ?? 0,
          height: probe.height ?? 0,
          format: 'svg',
          hasAlpha: true,
        };
      } catch {
        metadata = { width: 0, height: 0, format: 'svg', hasAlpha: true };
      }
    } else {
      // Raster: decode + re-encode with Sharp so stored bytes are always a
      // clean image (never the original, possibly-polyglot file).
      let image = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
      const probe = await image.metadata().catch(() => {
        throw ApiError.badRequest('File is not a valid image', 'INVALID_IMAGE');
      });
      if (!probe.width || !probe.height) {
        throw ApiError.badRequest('File is not a valid image', 'INVALID_IMAGE');
      }
      // Cap extreme dimensions while preserving print-relevant resolution.
      if (probe.width > 6000 || probe.height > 6000) {
        image = image.resize(6000, 6000, { fit: 'inside', withoutEnlargement: true });
      }
      const hasAlpha = Boolean(probe.hasAlpha);
      if (hasAlpha) {
        buffer = await image.png().toBuffer();
        contentType = 'image/png';
        key = `assets/${userId}/${id}.png`;
      } else {
        buffer = await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
        contentType = 'image/jpeg';
        key = `assets/${userId}/${id}.jpg`;
      }
      const finalProbe = await sharp(buffer).metadata();
      metadata = {
        width: finalProbe.width ?? probe.width,
        height: finalProbe.height ?? probe.height,
        format: finalProbe.format ?? 'unknown',
        hasAlpha,
      };
    }

    const stored = await storage.save(key, buffer, contentType);
    const record = await prisma.uploadedAsset.create({
      data: {
        userId,
        fileName: file.originalname.slice(0, 255),
        fileUrl: stored.url,
        fileType: contentType,
        fileSize: buffer.length,
        metadata: metadata ?? undefined,
      },
    });
    logger.info('upload.stored', { userId, assetId: record.id, bytes: buffer.length });

    return {
      id: record.id,
      fileName: record.fileName,
      fileUrl: record.fileUrl,
      fileType: record.fileType,
      fileSize: record.fileSize,
      metadata,
    };
  }

  /** Generic image upload for admin content (product photos, template previews). */
  async processAdminImage(file: Express.Multer.File, folder: 'products' | 'templates') {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomUUID();
    if (ext === '.svg') {
      const clean = Buffer.from(sanitizeSvg(file.buffer.toString('utf8')), 'utf8');
      const stored = await storage.save(`${folder}/${id}.svg`, clean, 'image/svg+xml');
      return { url: stored.url };
    }
    const buffer = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const stored = await storage.save(`${folder}/${id}.webp`, buffer, 'image/webp');
    return { url: stored.url };
  }

  /**
   * 3D model ingestion: structural validation (meshes/UVs/zones/triangles)
   * produces a report + quality score before the file is accepted. The
   * validation unit is pure and queue-ready (see modelValidation.service).
   */
  async processModelFile(file: Express.Multer.File) {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomUUID();
    const validation = validateModelBuffer(file.buffer, file.originalname);
    if (!validation.valid) {
      throw ApiError.badRequest(
        validation.checks.find((c) => c.level === 'error')?.message ?? 'Invalid 3D model',
        'INVALID_MODEL',
        validation,
      );
    }
    const stored = await storage.save(
      `models/${id}${ext}`,
      file.buffer,
      ext === '.glb' ? 'model/gltf-binary' : 'model/gltf+json',
    );
    logger.info('upload.model_stored', { bytes: file.buffer.length, score: validation.score });
    return { url: stored.url, validation };
  }

  listAssets(userId: number) {
    return prisma.uploadedAsset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async removeAsset(id: number, userId: number) {
    const asset = await prisma.uploadedAsset.findFirst({ where: { id, userId } });
    if (!asset) throw ApiError.notFound('Asset not found', 'ASSET_NOT_FOUND');
    // Delete DB record first; storage cleanup is best-effort.
    await prisma.uploadedAsset.delete({ where: { id } });
    const key = asset.fileUrl.replace(/^\/uploads\//, '');
    await storage.delete(key).catch(() => undefined);
  }
}

export const uploadService = new UploadService();
