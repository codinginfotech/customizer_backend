import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { designElementSchema } from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, noContent } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { ApiError } from '../../utils/apiError';

const templateJsonSchema = z.object({
  canvas: z.object({
    width: z.number().int().min(50).max(4000),
    height: z.number().int().min(50).max(4000),
  }),
  elements: z.array(designElementSchema).min(1).max(100),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  templateJson: templateJsonSchema,
  previewImage: z.string().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const templateRoutes = Router();

/** Public: browse active templates, optionally by category. */
templateRoutes.get(
  '/',
  validate({ query: z.object({ category: z.string().max(80).optional() }) }),
  catchAsync(async (req, res) => {
    const templates = await prisma.designTemplate.findMany({
      where: {
        status: 'ACTIVE',
        ...(req.query.category ? { category: String(req.query.category) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    ok(res, templates);
  }),
);

templateRoutes.get(
  '/categories',
  catchAsync(async (_req, res) => {
    const rows = await prisma.designTemplate.groupBy({
      by: ['category'],
      where: { status: 'ACTIVE' },
      _count: true,
    });
    ok(res, rows.map((r) => ({ category: r.category, count: r._count })));
  }),
);

const admin = [requireAuth, requireRole('ADMIN')] as const;

templateRoutes.get(
  '/all',
  ...admin,
  catchAsync(async (_req, res) => {
    ok(res, await prisma.designTemplate.findMany({ orderBy: { createdAt: 'desc' } }));
  }),
);

templateRoutes.post(
  '/',
  ...admin,
  validate({ body: createTemplateSchema }),
  catchAsync(async (req, res) => {
    const t = await prisma.designTemplate.create({
      data: {
        name: req.body.name,
        category: req.body.category,
        templateJson: req.body.templateJson as Prisma.InputJsonValue,
        previewImage: req.body.previewImage ?? null,
        status: req.body.status,
      },
    });
    created(res, t);
  }),
);

templateRoutes.put(
  '/:id',
  ...admin,
  validate({ params: idParam, body: createTemplateSchema.partial() }),
  catchAsync(async (req, res) => {
    const existing = await prisma.designTemplate.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound('Template not found', 'TEMPLATE_NOT_FOUND');
    const t = await prisma.designTemplate.update({
      where: { id: existing.id },
      data: {
        ...(req.body.name !== undefined ? { name: req.body.name } : {}),
        ...(req.body.category !== undefined ? { category: req.body.category } : {}),
        ...(req.body.templateJson !== undefined
          ? { templateJson: req.body.templateJson as Prisma.InputJsonValue }
          : {}),
        ...(req.body.previewImage !== undefined ? { previewImage: req.body.previewImage } : {}),
        ...(req.body.status !== undefined ? { status: req.body.status } : {}),
      },
    });
    ok(res, t);
  }),
);

templateRoutes.delete(
  '/:id',
  ...admin,
  validate({ params: idParam }),
  catchAsync(async (req, res) => {
    await prisma.designTemplate.delete({ where: { id: Number(req.params.id) } });
    noContent(res);
  }),
);
