import { z } from 'zod';
import { designDocumentSchema } from '@cpd/shared';

/** Preview images arrive as small data-URL PNG/WEBP strings from the canvas. */
export const previewDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Invalid preview image')
  .max(2_500_000)
  .optional();

export const createDesignSchema = z.object({
  name: z.string().min(1).max(160),
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  designJson: designDocumentSchema,
  previewImage: previewDataUrlSchema,
});

export const updateDesignSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  variantId: z.number().int().positive().nullable().optional(),
  designJson: designDocumentSchema.optional(),
  previewImage: previewDataUrlSchema,
  /** When true, snapshots the previous state as a new version. */
  createVersion: z.boolean().default(false),
});

export const listDesignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
