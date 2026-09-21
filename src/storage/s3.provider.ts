import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageProvider, StoredFile } from './types';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** CDN or bucket base URL for public reads, e.g. https://cdn.example.com */
  publicUrl: string;
}

/** Production storage for any S3-compatible service (AWS S3, MinIO, R2, DO Spaces). */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(key: string, data: Buffer, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object not readable: ${key}`);
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
