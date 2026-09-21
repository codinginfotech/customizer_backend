import path from 'path';
import { env } from '../config/env';
import { LocalStorageProvider } from './local.provider';
import { S3StorageProvider } from './s3.provider';
import { StorageProvider } from './types';

export const UPLOAD_ROOT = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

function createStorage(): StorageProvider {
  if (env.STORAGE_PROVIDER === 's3') {
    if (
      !env.STORAGE_BUCKET ||
      !env.STORAGE_ACCESS_KEY ||
      !env.STORAGE_SECRET_KEY ||
      !env.STORAGE_PUBLIC_URL
    ) {
      throw new Error(
        'STORAGE_PROVIDER=s3 requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY and STORAGE_PUBLIC_URL',
      );
    }
    return new S3StorageProvider({
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION || 'us-east-1',
      endpoint: env.STORAGE_ENDPOINT || undefined,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      publicUrl: env.STORAGE_PUBLIC_URL,
    });
  }
  return new LocalStorageProvider(UPLOAD_ROOT);
}

export const storage: StorageProvider = createStorage();
export * from './types';
