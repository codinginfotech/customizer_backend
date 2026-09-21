"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idParamSchema = exports.listDesignsQuerySchema = exports.updateDesignSchema = exports.createDesignSchema = exports.previewDataUrlSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("@cpd/shared");
/** Preview images arrive as small data-URL PNG/WEBP strings from the canvas. */
exports.previewDataUrlSchema = zod_1.z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Invalid preview image')
    .max(2_500_000)
    .optional();
exports.createDesignSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(160),
    productId: zod_1.z.number().int().positive(),
    variantId: zod_1.z.number().int().positive().nullable().optional(),
    designJson: shared_1.designDocumentSchema,
    previewImage: exports.previewDataUrlSchema,
});
exports.updateDesignSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(160).optional(),
    variantId: zod_1.z.number().int().positive().nullable().optional(),
    designJson: shared_1.designDocumentSchema.optional(),
    previewImage: exports.previewDataUrlSchema,
    /** When true, snapshots the previous state as a new version. */
    createVersion: zod_1.z.boolean().default(false),
});
exports.listDesignsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(12),
});
exports.idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
//# sourceMappingURL=design.validators.js.map