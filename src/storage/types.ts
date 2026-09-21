export interface StoredFile {
  /** Storage key, e.g. "assets/2024/abc.png" */
  key: string;
  /** Public URL the client can load. */
  url: string;
}

export interface StorageProvider {
  /** Persist a buffer and return its key + public URL. */
  save(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  /** Read a stored file back (used by the production export renderer). */
  read(key: string): Promise<Buffer>;
  /** Remove a stored file. Missing files must not throw. */
  delete(key: string): Promise<void>;
  /** Resolve a key to a public URL. */
  publicUrl(key: string): string;
}
