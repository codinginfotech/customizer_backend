import fs from 'fs/promises';
import path from 'path';
import { StorageProvider, StoredFile } from './types';

/**
 * Development storage: files live under UPLOAD_DIR and are served by Express
 * at /uploads/<key>. Keys are validated to prevent path traversal.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  private resolveSafe(key: string): string {
    const normalized = path.normalize(key).replace(/^([/\\])+/, '');
    const full = path.resolve(this.rootDir, normalized);
    if (!full.startsWith(path.resolve(this.rootDir))) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<StoredFile> {
    const full = this.resolveSafe(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { key, url: this.publicUrl(key) };
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveSafe(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(key));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  publicUrl(key: string): string {
    return `/uploads/${key.replace(/\\/g, '/')}`;
  }
}
