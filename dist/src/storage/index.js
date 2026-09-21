"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.UPLOAD_ROOT = void 0;
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const local_provider_1 = require("./local.provider");
const s3_provider_1 = require("./s3.provider");
exports.UPLOAD_ROOT = path_1.default.isAbsolute(env_1.env.UPLOAD_DIR)
    ? env_1.env.UPLOAD_DIR
    : path_1.default.resolve(process.cwd(), env_1.env.UPLOAD_DIR);
function createStorage() {
    if (env_1.env.STORAGE_PROVIDER === 's3') {
        if (!env_1.env.STORAGE_BUCKET ||
            !env_1.env.STORAGE_ACCESS_KEY ||
            !env_1.env.STORAGE_SECRET_KEY ||
            !env_1.env.STORAGE_PUBLIC_URL) {
            throw new Error('STORAGE_PROVIDER=s3 requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY and STORAGE_PUBLIC_URL');
        }
        return new s3_provider_1.S3StorageProvider({
            bucket: env_1.env.STORAGE_BUCKET,
            region: env_1.env.STORAGE_REGION || 'us-east-1',
            endpoint: env_1.env.STORAGE_ENDPOINT || undefined,
            accessKeyId: env_1.env.STORAGE_ACCESS_KEY,
            secretAccessKey: env_1.env.STORAGE_SECRET_KEY,
            publicUrl: env_1.env.STORAGE_PUBLIC_URL,
        });
    }
    return new local_provider_1.LocalStorageProvider(exports.UPLOAD_ROOT);
}
exports.storage = createStorage();
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map