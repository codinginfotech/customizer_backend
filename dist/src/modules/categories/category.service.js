"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryService = exports.CategoryService = void 0;
const prisma_1 = require("../../lib/prisma");
const apiError_1 = require("../../utils/apiError");
const misc_1 = require("../../utils/misc");
class CategoryService {
    listPublic() {
        return prisma_1.prisma.category.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
        });
    }
    listAll() {
        return prisma_1.prisma.category.findMany({
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { products: true } } },
        });
    }
    async create(input) {
        return prisma_1.prisma.category.create({
            data: {
                name: input.name,
                slug: input.slug || (0, misc_1.slugify)(input.name),
                description: input.description,
                sortOrder: input.sortOrder,
                status: input.status,
            },
        });
    }
    async update(id, input) {
        const existing = await prisma_1.prisma.category.findUnique({ where: { id } });
        if (!existing)
            throw apiError_1.ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
        return prisma_1.prisma.category.update({ where: { id }, data: input });
    }
    async remove(id) {
        const count = await prisma_1.prisma.product.count({ where: { categoryId: id } });
        if (count > 0) {
            throw apiError_1.ApiError.conflict('Category has products — move or delete them first', 'CATEGORY_NOT_EMPTY');
        }
        await prisma_1.prisma.category.delete({ where: { id } });
    }
    async reorder(order) {
        await prisma_1.prisma.$transaction(order.map((o) => prisma_1.prisma.category.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } })));
    }
}
exports.CategoryService = CategoryService;
exports.categoryService = new CategoryService();
//# sourceMappingURL=category.service.js.map