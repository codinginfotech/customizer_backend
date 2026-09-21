import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../utils/catchAsync';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/apiError';
import { exportService } from './export.service';
import { DesignDocument } from '@cpd/shared';

export const exportRoutes = Router();
exportRoutes.use(requireAuth);

/** Production-quality export of a saved design's print area. */
exportRoutes.get(
  '/designs/:id',
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({
      areaKey: z.string().max(64).optional(),
      dpi: z.coerce.number().int().min(72).max(600).default(300),
    }),
  }),
  catchAsync(async (req, res) => {
    const design = await prisma.design.findUnique({ where: { id: Number(req.params.id) } });
    if (!design) throw ApiError.notFound('Design not found', 'DESIGN_NOT_FOUND');
    if (design.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden('You do not own this design', 'NOT_DESIGN_OWNER');
    }
    const png = await exportService.renderProductionFile(
      design.designJson as unknown as DesignDocument,
      design.productId,
      String(req.query.areaKey || ''),
      Number(req.query.dpi),
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="design-${design.id}-${req.query.areaKey || 'print'}-${req.query.dpi}dpi.png"`,
    );
    res.send(png);
  }),
);
