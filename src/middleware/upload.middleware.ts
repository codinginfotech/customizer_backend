import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

const MODEL_MIME_TYPES = new Set(['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);

/**
 * Uploads are held in memory, validated, then re-encoded with Sharp before
 * being persisted — raster uploads never hit storage byte-for-byte, which
 * neutralizes polyglot-file attacks. SVGs are sanitized separately.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_MIME_TYPES.has(file.mimetype) || !IMAGE_EXTENSIONS.has(ext)) {
      return cb(
        ApiError.badRequest(
          'Unsupported file type. Allowed: PNG, JPG, WEBP, SVG',
          'UNSUPPORTED_FILE_TYPE',
        ),
      );
    }
    cb(null, true);
  },
});

export const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MODEL_EXTENSIONS.has(ext) || !MODEL_MIME_TYPES.has(file.mimetype)) {
      return cb(
        ApiError.badRequest('Unsupported model type. Allowed: GLB, GLTF', 'UNSUPPORTED_FILE_TYPE'),
      );
    }
    cb(null, true);
  },
});
