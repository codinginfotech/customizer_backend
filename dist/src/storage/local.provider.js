"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageProvider = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
/**
 * Development storage: files live under UPLOAD_DIR and are served by Express
 * at /uploads/<key>. Keys are validated to prevent path traversal.
 */
class LocalStorageProvider {
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    resolveSafe(key) {
        const normalized = path_1.default.normalize(key).replace(/^([/\\])+/, '');
        const full = path_1.default.resolve(this.rootDir, normalized);
        if (!full.startsWith(path_1.default.resolve(this.rootDir))) {
            throw new Error('Invalid storage key');
        }
        return full;
    }
    async save(key, data) {
        const full = this.resolveSafe(key);
        await promises_1.default.mkdir(path_1.default.dirname(full), { recursive: true });
        await promises_1.default.writeFile(full, data);
        return { key, url: this.publicUrl(key) };
    }
    async read(key) {
        return promises_1.default.readFile(this.resolveSafe(key));
    }
    async delete(key) {
        try {
            await promises_1.default.unlink(this.resolveSafe(key));
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                throw err;
        }
    }
    publicUrl(key) {
        return `/uploads/${key.replace(/\\/g, '/')}`;
    }
}
exports.LocalStorageProvider = LocalStorageProvider;
//# sourceMappingURL=local.provider.js.map