"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadService = exports.UploadService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const prisma_1 = require("../../lib/prisma");
const storage_1 = require("../../storage");
const apiError_1 = require("../../utils/apiError");
const logger_1 = require("../../config/logger");
const modelValidation_service_1 = require("../models/modelValidation.service");
/**
 * SVG sanitization: strip script blocks, event handlers, foreignObject and
 * external references. Design uploads never execute in a privileged context
 * (they are drawn to canvas), but defense in depth costs little.
 */
function sanitizeSvg(svg) {
    return svg
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
        .replace(/xlink:href\s*=\s*["'](?!#|data:image\/)[^"']*["']/gi, '')
        .replace(/href\s*=\s*["'](?!#|data:image\/)[^"']*["']/gi, '');
}
class UploadService {
    async processDesignAsset(userId, file) {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const id = crypto_1.default.randomUUID();
        let buffer;
        let contentType;
        let key;
        let metadata = null;
        if (ext === '.svg') {
            const raw = file.buffer.toString('utf8');
            if (raw.length > 2_000_000)
                throw apiError_1.ApiError.badRequest('SVG is too large', 'FILE_TOO_LARGE');
            if (!/<svg[\s>]/i.test(raw))
                throw apiError_1.ApiError.badRequest('Not a valid SVG file', 'INVALID_SVG');
            buffer = Buffer.from(sanitizeSvg(raw), 'utf8');
            contentType = 'image/svg+xml';
            key = `assets/${userId}/${id}.svg`;
            try {
                const probe = await (0, sharp_1.default)(buffer).metadata();
                metadata = {
                    width: probe.width ?? 0,
                    height: probe.height ?? 0,
                    format: 'svg',
                    hasAlpha: true,
                };
            }
            catch {
                metadata = { width: 0, height: 0, format: 'svg', hasAlpha: true };
            }
        }
        else {
            // Raster: decode + re-encode with Sharp so stored bytes are always a
            // clean image (never the original, possibly-polyglot file).
            let image = (0, sharp_1.default)(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
            const probe = await image.metadata().catch(() => {
                throw apiError_1.ApiError.badRequest('File is not a valid image', 'INVALID_IMAGE');
            });
            if (!probe.width || !probe.height) {
                throw apiError_1.ApiError.badRequest('File is not a valid image', 'INVALID_IMAGE');
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
            }
            else {
                buffer = await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
                contentType = 'image/jpeg';
                key = `assets/${userId}/${id}.jpg`;
            }
            const finalProbe = await (0, sharp_1.default)(buffer).metadata();
            metadata = {
                width: finalProbe.width ?? probe.width,
                height: finalProbe.height ?? probe.height,
                format: finalProbe.format ?? 'unknown',
                hasAlpha,
            };
        }
        const stored = await storage_1.storage.save(key, buffer, contentType);
        const record = await prisma_1.prisma.uploadedAsset.create({
            data: {
                userId,
                fileName: file.originalname.slice(0, 255),
                fileUrl: stored.url,
                fileType: contentType,
                fileSize: buffer.length,
                metadata: metadata ?? undefined,
            },
        });
        logger_1.logger.info('upload.stored', { userId, assetId: record.id, bytes: buffer.length });
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
    async processAdminImage(file, folder) {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const id = crypto_1.default.randomUUID();
        if (ext === '.svg') {
            const clean = Buffer.from(sanitizeSvg(file.buffer.toString('utf8')), 'utf8');
            const stored = await storage_1.storage.save(`${folder}/${id}.svg`, clean, 'image/svg+xml');
            return { url: stored.url };
        }
        const buffer = await (0, sharp_1.default)(file.buffer, { limitInputPixels: 40_000_000 })
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
        const stored = await storage_1.storage.save(`${folder}/${id}.webp`, buffer, 'image/webp');
        return { url: stored.url };
    }
    /**
     * 3D model ingestion: structural validation (meshes/UVs/zones/triangles)
     * produces a report + quality score before the file is accepted. The
     * validation unit is pure and queue-ready (see modelValidation.service).
     */
    async processModelFile(file) {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const id = crypto_1.default.randomUUID();
        const validation = (0, modelValidation_service_1.validateModelBuffer)(file.buffer, file.originalname);
        if (!validation.valid) {
            throw apiError_1.ApiError.badRequest(validation.checks.find((c) => c.level === 'error')?.message ?? 'Invalid 3D model', 'INVALID_MODEL', validation);
        }
        const stored = await storage_1.storage.save(`models/${id}${ext}`, file.buffer, ext === '.glb' ? 'model/gltf-binary' : 'model/gltf+json');
        logger_1.logger.info('upload.model_stored', { bytes: file.buffer.length, score: validation.score });
        return { url: stored.url, validation };
    }
    listAssets(userId) {
        return prisma_1.prisma.uploadedAsset.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }
    async removeAsset(id, userId) {
        const asset = await prisma_1.prisma.uploadedAsset.findFirst({ where: { id, userId } });
        if (!asset)
            throw apiError_1.ApiError.notFound('Asset not found', 'ASSET_NOT_FOUND');
        // Delete DB record first; storage cleanup is best-effort.
        await prisma_1.prisma.uploadedAsset.delete({ where: { id } });
        const key = asset.fileUrl.replace(/^\/uploads\//, '');
        await storage_1.storage.delete(key).catch(() => undefined);
    }
}
exports.UploadService = UploadService;
exports.uploadService = new UploadService();
//# sourceMappingURL=upload.service.js.map