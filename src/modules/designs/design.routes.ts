import { Router } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, noContent, buildMeta } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { designService } from './design.service';
import {
  createDesignSchema,
  idParamSchema,
  listDesignsQuerySchema,
  updateDesignSchema,
} from './design.validators';
import { z } from 'zod';

export const designRoutes = Router();

designRoutes.use(requireAuth);

designRoutes.get(
  '/',
  validate({ query: listDesignsQuerySchema }),
  catchAsync(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await designService.list(req.user!.id, page, pageSize);
    ok(res, items, buildMeta(page, pageSize, total));
  }),
);

designRoutes.post(
  '/',
  validate({ body: createDesignSchema }),
  catchAsync(async (req, res) => {
    created(res, await designService.create(req.user!.id, req.body));
  }),
);

designRoutes.get(
  '/:id',
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    ok(res, await designService.getOwned(Number(req.params.id), req.user!.id, req.user!.role === 'ADMIN'));
  }),
);

designRoutes.put(
  '/:id',
  validate({ params: idParamSchema, body: updateDesignSchema }),
  catchAsync(async (req, res) => {
    ok(res, await designService.update(Number(req.params.id), req.user!.id, req.body));
  }),
);

designRoutes.delete(
  '/:id',
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    await designService.remove(Number(req.params.id), req.user!.id);
    noContent(res);
  }),
);

designRoutes.post(
  '/:id/duplicate',
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    created(res, await designService.duplicate(Number(req.params.id), req.user!.id));
  }),
);

designRoutes.post(
  '/:id/share',
  validate({ params: idParamSchema, body: z.object({ enabled: z.boolean() }) }),
  catchAsync(async (req, res) => {
    ok(res, await designService.setShared(Number(req.params.id), req.user!.id, req.body.enabled));
  }),
);

designRoutes.post(
  '/:id/versions',
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    created(res, await designService.createVersion(Number(req.params.id), req.user!.id));
  }),
);

designRoutes.get(
  '/:id/versions/:versionId',
  validate({
    params: z.object({
      id: z.coerce.number().int().positive(),
      versionId: z.coerce.number().int().positive(),
    }),
  }),
  catchAsync(async (req, res) => {
    ok(
      res,
      await designService.getVersion(Number(req.params.id), Number(req.params.versionId), req.user!.id),
    );
  }),
);
