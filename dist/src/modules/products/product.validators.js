"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productModelSchema = exports.productImageSchema = exports.printAreaSchema = exports.variantSchema = exports.updateProductSchema = exports.createProductSchema = exports.productChildParamSchema = exports.idParamSchema = exports.slugParamSchema = exports.listProductsQuerySchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("@cpd/shared");
exports.listProductsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(60).default(12),
    search: zod_1.z.string().max(120).optional(),
    category: zod_1.z.string().max(140).optional(),
    sort: zod_1.z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
    featured: zod_1.z.coerce.boolean().optional(),
    minPrice: zod_1.z.coerce.number().min(0).optional(),
    maxPrice: zod_1.z.coerce.number().min(0).optional(),
});
exports.slugParamSchema = zod_1.z.object({ slug: zod_1.z.string().min(1).max(180) });
exports.idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
exports.productChildParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
    childId: zod_1.z.coerce.number().int().positive(),
});
exports.createProductSchema = zod_1.z.object({
    categoryId: zod_1.z.number().int().positive(),
    name: zod_1.z.string().min(2).max(160),
    slug: zod_1.z.string().min(2).max(180).regex(/^[a-z0-9-]+$/).optional(),
    description: zod_1.z.string().max(5000).optional(),
    basePrice: zod_1.z.number().min(0).max(100000),
    pricingRules: shared_1.pricingRulesSchema.partial().optional(),
    tags: zod_1.z.array(shared_1.productTagSchema).max(8).optional(),
    metadata: shared_1.productMetadataSchema.optional(),
    printMethods: zod_1.z.array(shared_1.printMethodSchema).max(9).optional(),
    productionRules: shared_1.productionRulesSchema.partial().optional(),
    featured: zod_1.z.boolean().default(false),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
exports.updateProductSchema = exports.createProductSchema.partial();
exports.variantSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(160),
    color: zod_1.z.string().max(30).nullable().optional(),
    colorName: zod_1.z.string().max(60).nullable().optional(),
    size: zod_1.z.string().max(40).nullable().optional(),
    material: zod_1.z.string().max(80).nullable().optional(),
    sku: zod_1.z.string().min(1).max(80),
    price: zod_1.z.number().min(0).max(100000).nullable().optional(),
    stock: zod_1.z.number().int().min(0).default(0),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
exports.printAreaSchema = zod_1.z.object({
    key: zod_1.z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_-]+$/, 'Key must be lowercase letters, numbers, dashes'),
    name: zod_1.z.string().min(1).max(100),
    width: zod_1.z.number().int().min(50).max(4000),
    height: zod_1.z.number().int().min(50).max(4000),
    maxDesignWidth: zod_1.z.number().int().positive().nullable().optional(),
    maxDesignHeight: zod_1.z.number().int().positive().nullable().optional(),
    bleed: zod_1.z.number().int().min(0).max(200).default(0),
    safeArea: shared_1.safeAreaSchema,
    physicalWidthIn: zod_1.z.number().positive().max(200).nullable().optional(),
    physicalHeightIn: zod_1.z.number().positive().max(200).nullable().optional(),
    mockup: shared_1.mockupPlacementSchema.nullable().optional(),
    templateImage: zod_1.z.string().max(500).nullable().optional(),
    modelMeshName: zod_1.z.string().max(100).nullable().optional(),
    textureConfig: shared_1.textureConfigSchema.nullable().optional(),
    projection: shared_1.surfaceProjectionSchema.default('uv'),
    sortOrder: zod_1.z.number().int().default(0),
});
exports.productImageSchema = zod_1.z.object({
    url: zod_1.z.string().min(1).max(500),
    alt: zod_1.z.string().max(200).optional(),
    isPrimary: zod_1.z.boolean().default(false),
    sortOrder: zod_1.z.number().int().default(0),
});
exports.productModelSchema = zod_1.z.object({
    modelUrl: zod_1.z.string().max(500).nullable().optional(),
    thumbnailUrl: zod_1.z.string().max(500).nullable().optional(),
    modelType: zod_1.z.enum(['GLTF', 'PRIMITIVE']),
    configuration: shared_1.modelConfigurationSchema,
    /** Ingestion report from the model upload endpoint (stored verbatim). */
    validation: shared_1.modelValidationReportSchema.nullable().optional(),
});
//# sourceMappingURL=product.validators.js.map