import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const publicInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: { where: { status: 'ACTIVE' }, orderBy: { id: 'asc' } },
  printAreas: { orderBy: { sortOrder: 'asc' } },
  model: true,
} satisfies Prisma.ProductInclude;

export const productRepository = {
  publicInclude,

  findMany(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput, skip: number, take: number) {
    return prisma.$transaction([
      prisma.product.findMany({ where, orderBy, skip, take, include: publicInclude }),
      prisma.product.count({ where }),
    ]);
  },

  findBySlug(slug: string) {
    return prisma.product.findUnique({ where: { slug }, include: publicInclude });
  },

  findById(id: number) {
    return prisma.product.findUnique({ where: { id }, include: publicInclude });
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data, include: publicInclude });
  },

  update(id: number, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data, include: publicInclude });
  },

  delete(id: number) {
    return prisma.product.delete({ where: { id } });
  },
};
