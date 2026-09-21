"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageProvider = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
/** Production storage for any S3-compatible service (AWS S3, MinIO, R2, DO Spaces). */
class S3StorageProvider {
    constructor(config) {
        this.config = config;
        this.client = new client_s3_1.S3Client({
            region: config.region,
            ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }
    async save(key, data, contentType) {
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
        }));
        return { key, url: this.publicUrl(key) };
    }
    async read(key) {
        const res = await this.client.send(new client_s3_1.GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes)
            throw new Error(`Object not readable: ${key}`);
        return Buffer.from(bytes);
    }
    async delete(key) {
        await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    }
    publicUrl(key) {
        return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
    }
}
exports.S3StorageProvider = S3StorageProvider;
//# sourceMappingURL=s3.provider.js.map