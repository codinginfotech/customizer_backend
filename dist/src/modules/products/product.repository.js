"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRepository = void 0;
const prisma_1 = require("../../lib/prisma");
const publicInclude = {
    category: { select: { id: true, name: true, slug: true } },
    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
    variants: { where: { status: 'ACTIVE' }, orderBy: { id: 'asc' } },
    printAreas: { orderBy: { sortOrder: 'asc' } },
    model: true,
};
exports.productRepository = {
    publicInclude,
    findMany(where, orderBy, skip, take) {
        return prisma_1.prisma.$transaction([
            prisma_1.prisma.product.findMany({ where, orderBy, skip, take, include: publicInclude }),
            prisma_1.prisma.product.count({ where }),
        ]);
    },
    findBySlug(slug) {
        return prisma_1.prisma.product.findUnique({ where: { slug }, include: publicInclude });
    },
    findById(id) {
        return prisma_1.prisma.product.findUnique({ where: { id }, include: publicInclude });
    },
    create(data) {
        return prisma_1.prisma.product.create({ data, include: publicInclude });
    },
    update(id, data) {
        return prisma_1.prisma.product.update({ where: { id }, data, include: publicInclude });
    },
    delete(id) {
        return prisma_1.prisma.product.delete({ where: { id } });
    },
};
//# sourceMappingURL=product.repository.js.map