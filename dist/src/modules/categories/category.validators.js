"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idParamSchema = exports.reorderCategoriesSchema = exports.updateCategorySchema = exports.createCategorySchema = void 0;
const zod_1 = require("zod");
exports.createCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    slug: zod_1.z.string().min(2).max(140).regex(/^[a-z0-9-]+$/).optional(),
    description: zod_1.z.string().max(2000).optional(),
    sortOrder: zod_1.z.number().int().min(0).default(0),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
exports.updateCategorySchema = exports.createCategorySchema.partial();
exports.reorderCategoriesSchema = zod_1.z.object({
    order: zod_1.z.array(zod_1.z.object({ id: zod_1.z.number().int().positive(), sortOrder: zod_1.z.number().int() })).min(1),
});
exports.idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
//# sourceMappingURL=category.validators.js.map