"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelUpload = exports.imageUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const apiError_1 = require("../utils/apiError");
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
exports.imageUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: env_1.env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!IMAGE_MIME_TYPES.has(file.mimetype) || !IMAGE_EXTENSIONS.has(ext)) {
            return cb(apiError_1.ApiError.badRequest('Unsupported file type. Allowed: PNG, JPG, WEBP, SVG', 'UNSUPPORTED_FILE_TYPE'));
        }
        cb(null, true);
    },
});
exports.modelUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!MODEL_EXTENSIONS.has(ext) || !MODEL_MIME_TYPES.has(file.mimetype)) {
            return cb(apiError_1.ApiError.badRequest('Unsupported model type. Allowed: GLB, GLTF', 'UNSUPPORTED_FILE_TYPE'));
        }
        cb(null, true);
    },
});
//# sourceMappingURL=upload.middleware.js.map