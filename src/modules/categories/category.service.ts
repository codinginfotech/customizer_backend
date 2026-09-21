import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { slugify } from '../../utils/misc';
import { z } from 'zod';
import {
  createCategorySchema,
  updateCategorySchema,
} from './category.validators';

type CreateInput = z.infer<typeof createCategorySchema>;
type UpdateInput = z.infer<typeof updateCategorySchema>;

export class CategoryService {
  listPublic() {
    return prisma.category.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
    });
  }

  listAll() {
    return prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(input: CreateInput) {
    return prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        sortOrder: input.sortOrder,
        status: input.status,
      },
    });
  }

  async update(id: number, input: UpdateInput) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
    return prisma.category.update({ where: { id }, data: input });
  }

  async remove(id: number) {
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      throw ApiError.conflict(
        'Category has products — move or delete them first',
        'CATEGORY_NOT_EMPTY',
      );
    }
    await prisma.category.delete({ where: { id } });
  }

  async reorder(order: { id: number; sortOrder: number }[]) {
    await prisma.$transaction(
      order.map((o) =>
        prisma.category.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } }),
      ),
    );
  }
}

export const categoryService = new CategoryService();
