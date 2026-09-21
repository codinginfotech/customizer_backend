import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  // Proxy hops between the client and this process (nginx, hosting edge, …).
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // Google sign-in: ID tokens are verified against this Firebase project.
  FIREBASE_PROJECT_ID: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),

  TAX_RATE: z.coerce.number().default(0.08),
  FLAT_SHIPPING: z.coerce.number().default(5.99),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().default(75),

  MAX_UPLOAD_MB: z.coerce.number().default(15),

  // Shopify app (optional — the whole /api/shopify surface is disabled when
  // SHOPIFY_API_KEY / SHOPIFY_API_SECRET are blank).
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  // Public URL the app is reachable at (the frontend origin — /api is proxied).
  SHOPIFY_APP_URL: z.string().url().optional(),
  SHOPIFY_SCOPES: z.string().default('read_products,read_orders'),
  SHOPIFY_API_VERSION: z.string().default('2026-04'),
  // Optional dedicated key for encrypting shop access tokens at rest (32+ chars).
  // Falls back to a key derived from SHOPIFY_API_SECRET.
  SHOPIFY_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
