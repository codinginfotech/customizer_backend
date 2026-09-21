import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, buildMeta } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { orderService } from './order.service';
import { audit } from '../../services/audit.service';
import { exportService } from '../export/export.service';

const shippingAddressSchema = z.object({
  fullName: z.string().min(2).max(120),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(2).max(20),
  country: z.string().min(2).max(80),
  phone: z.string().max(30).optional(),
});

const createOrderSchema = z.object({ shippingAddress: shippingAddressSchema });
const idParam = z.object({ id: z.coerce.number().int().positive() });

export const orderRoutes = Router();
orderRoutes.use(requireAuth);

orderRoutes.post(
  '/',
  validate({ body: createOrderSchema }),
  catchAsync(async (req, res) => {
    created(res, await orderService.createFromCart(req.user!.id, req.body.shippingAddress));
  }),
);

orderRoutes.get(
  '/',
  catchAsync(async (req, res) => {
    ok(res, await orderService.listForUser(req.user!.id));
  }),
);

// Admin listing — before /:id so "admin" isn't parsed as an id.
orderRoutes.get(
  '/admin/all',
  requireRole('ADMIN'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      status: z
        .enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
        .optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const { items, total } = await orderService.listAll(
      page,
      pageSize,
      req.query.status as never,
    );
    ok(res, items, buildMeta(page, pageSize, total));
  }),
);

orderRoutes.get(
  '/:id',
  validate({ params: idParam }),
  catchAsync(async (req, res) => {
    ok(
      res,
      await orderService.getForUser(Number(req.params.id), req.user!.id, req.user!.role === 'ADMIN'),
    );
  }),
);

orderRoutes.put(
  '/:id/status',
  requireRole('ADMIN'),
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
    }),
  }),
  catchAsync(async (req, res) => {
    const order = await orderService.updateStatus(Number(req.params.id), req.body.status);
    void audit(req.user!.id, 'order.status_changed', 'order', order.id, { status: req.body.status });
    ok(res, order);
  }),
);

/** Production files for an ordered item — renders the frozen snapshot. */
orderRoutes.get(
  '/:id/items/:itemId/production',
  validate({
    params: z.object({
      id: z.coerce.number().int().positive(),
      itemId: z.coerce.number().int().positive(),
    }),
    query: z.object({
      areaKey: z.string().max(64).optional(),
      dpi: z.coerce.number().int().min(72).max(600).default(300),
    }),
  }),
  catchAsync(async (req, res) => {
    const item = await orderService.getItemSnapshot(
      Number(req.params.id),
      Number(req.params.itemId),
      req.user!.id,
      req.user!.role === 'ADMIN',
    );
    if (!item.designSnapshot) {
      res.status(404).json({ success: false, message: 'This item has no design', code: 'NO_DESIGN' });
      return;
    }
    const png = await exportService.renderProductionFile(
      item.designSnapshot as never,
      item.productId,
      String(req.query.areaKey || ''),
      Number(req.query.dpi),
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="order-item-${item.id}-${req.query.areaKey || 'area'}.png"`,
    );
    res.send(png);
  }),
);
