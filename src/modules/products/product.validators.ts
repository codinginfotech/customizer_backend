import { z } from 'zod';
import {
  modelConfigurationSchema,
  modelValidationReportSchema,
  mockupPlacementSchema,
  pricingRulesSchema,
  printMethodSchema,
  productionRulesSchema,
  productMetadataSchema,
  productTagSchema,
  safeAreaSchema,
  surfaceProjectionSchema,
  textureConfigSchema,
} from '@cpd/shared';

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
  search: z.string().max(120).optional(),
  category: z.string().max(140).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  featured: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export const slugParamSchema = z.object({ slug: z.string().min(1).max(180) });
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const productChildParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  childId: z.coerce.number().int().positive(),
});

export const createProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).optional(),
  basePrice: z.number().min(0).max(100000),
  pricingRules: pricingRulesSchema.partial().optional(),
  tags: z.array(productTagSchema).max(8).optional(),
  metadata: productMetadataSchema.optional(),
  printMethods: z.array(printMethodSchema).max(9).optional(),
  productionRules: productionRulesSchema.partial().optional(),
  featured: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const updateProductSchema = createProductSchema.partial();

export const variantSchema = z.object({
  name: z.string().min(1).max(160),
  color: z.string().max(30).nullable().optional(),
  colorName: z.string().max(60).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  material: z.string().max(80).nullable().optional(),
  sku: z.string().min(1).max(80),
  price: z.number().min(0).max(100000).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const printAreaSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, 'Key must be lowercase letters, numbers, dashes'),
  name: z.string().min(1).max(100),
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(50).max(4000),
  maxDesignWidth: z.number().int().positive().nullable().optional(),
  maxDesignHeight: z.number().int().positive().nullable().optional(),
  bleed: z.number().int().min(0).max(200).default(0),
  safeArea: safeAreaSchema,
  physicalWidthIn: z.number().positive().max(200).nullable().optional(),
  physicalHeightIn: z.number().positive().max(200).nullable().optional(),
  mockup: mockupPlacementSchema.nullable().optional(),
  templateImage: z.string().max(500).nullable().optional(),
  modelMeshName: z.string().max(100).nullable().optional(),
  textureConfig: textureConfigSchema.nullable().optional(),
  projection: surfaceProjectionSchema.default('uv'),
  sortOrder: z.number().int().default(0),
});

export const productImageSchema = z.object({
  url: z.string().min(1).max(500),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const productModelSchema = z.object({
  modelUrl: z.string().max(500).nullable().optional(),
  thumbnailUrl: z.string().max(500).nullable().optional(),
  modelType: z.enum(['GLTF', 'PRIMITIVE']),
  configuration: modelConfigurationSchema,
  /** Ingestion report from the model upload endpoint (stored verbatim). */
  validation: modelValidationReportSchema.nullable().optional(),
});
