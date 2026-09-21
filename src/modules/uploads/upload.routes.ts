import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, noContent } from '../../utils/respond';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { imageUpload, modelUpload } from '../../middleware/upload.middleware';
import { uploadLimiter } from '../../middleware/rateLimit.middleware';
import { uploadService } from './upload.service';
import { ApiError } from '../../utils/apiError';
import { validate } from '../../middleware/validate.middleware';

export const uploadRoutes = Router();

uploadRoutes.use(requireAuth);

/** User design asset upload (drag & drop onto the canvas). */
uploadRoutes.post(
  '/',
  uploadLimiter,
  imageUpload.single('file'),
  catchAsync(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file provided', 'NO_FILE');
    created(res, await uploadService.processDesignAsset(req.user!.id, req.file));
  }),
);

uploadRoutes.get(
  '/assets',
  catchAsync(async (req, res) => {
    ok(res, await uploadService.listAssets(req.user!.id));
  }),
);

uploadRoutes.delete(
  '/assets/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    await uploadService.removeAsset(Number(req.params.id), req.user!.id);
    noContent(res);
  }),
);

/** Admin uploads: product/template imagery and 3D models. */
uploadRoutes.post(
  '/admin/image',
  requireRole('ADMIN'),
  uploadLimiter,
  imageUpload.single('file'),
  validate({ query: z.object({ folder: z.enum(['products', 'templates']).default('products') }) }),
  catchAsync(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file provided', 'NO_FILE');
    created(
      res,
      await uploadService.processAdminImage(req.file, req.query.folder as 'products' | 'templates'),
    );
  }),
);

uploadRoutes.post(
  '/admin/model',
  requireRole('ADMIN'),
  uploadLimiter,
  modelUpload.single('file'),
  catchAsync(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file provided', 'NO_FILE');
    created(res, await uploadService.processModelFile(req.file));
  }),
);
