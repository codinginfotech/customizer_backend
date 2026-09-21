import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const updateCategorySchema = createCategorySchema.partial();

export const reorderCategoriesSchema = z.object({
  order: z.array(z.object({ id: z.number().int().positive(), sortOrder: z.number().int() })).min(1),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
