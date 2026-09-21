import { Router } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, noContent } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { categoryService } from './category.service';
import {
  createCategorySchema,
  idParamSchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from './category.validators';

export const categoryRoutes = Router();

categoryRoutes.get(
  '/',
  catchAsync(async (_req, res) => {
    ok(res, await categoryService.listPublic());
  }),
);

const admin = [requireAuth, requireRole('ADMIN')] as const;

categoryRoutes.get(
  '/all',
  ...admin,
  catchAsync(async (_req, res) => {
    ok(res, await categoryService.listAll());
  }),
);

categoryRoutes.post(
  '/',
  ...admin,
  validate({ body: createCategorySchema }),
  catchAsync(async (req, res) => {
    created(res, await categoryService.create(req.body));
  }),
);

categoryRoutes.put(
  '/reorder',
  ...admin,
  validate({ body: reorderCategoriesSchema }),
  catchAsync(async (req, res) => {
    await categoryService.reorder(req.body.order);
    ok(res, { reordered: true });
  }),
);

categoryRoutes.put(
  '/:id',
  ...admin,
  validate({ params: idParamSchema, body: updateCategorySchema }),
  catchAsync(async (req, res) => {
    ok(res, await categoryService.update(Number(req.params.id), req.body));
  }),
);

categoryRoutes.delete(
  '/:id',
  ...admin,
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    await categoryService.remove(Number(req.params.id));
    noContent(res);
  }),
);
