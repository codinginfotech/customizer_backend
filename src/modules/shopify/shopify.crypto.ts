import crypto from 'node:crypto';
import { env } from '../../config/env';

/**
 * Shop access tokens are as sensitive as passwords (they act on the store),
 * so they are AES-256-GCM encrypted at rest. The key comes from
 * SHOPIFY_TOKEN_ENCRYPTION_KEY, or is derived from the app secret when unset.
 * Stored format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */

function key(): Buffer {
  const material = env.SHOPIFY_TOKEN_ENCRYPTION_KEY || env.SHOPIFY_API_SECRET || '';
  if (!material) throw new Error('No key material for token encryption');
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptToken(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Unrecognised token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}

/** Opaque public token (URL-safe). */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
