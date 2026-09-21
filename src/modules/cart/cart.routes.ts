import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../utils/catchAsync';
import { ok } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { cartService } from './cart.service';

const addItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  designId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().min(1).max(10000).default(1),
});

const updateItemSchema = z.object({ quantity: z.number().int().min(1).max(10000) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

export const cartRoutes = Router();
cartRoutes.use(requireAuth);

cartRoutes.get(
  '/',
  catchAsync(async (req, res) => {
    ok(res, await cartService.getCart(req.user!.id));
  }),
);

cartRoutes.post(
  '/items',
  validate({ body: addItemSchema }),
  catchAsync(async (req, res) => {
    ok(res, await cartService.addItem(req.user!.id, req.body));
  }),
);

cartRoutes.put(
  '/items/:id',
  validate({ params: idParam, body: updateItemSchema }),
  catchAsync(async (req, res) => {
    ok(res, await cartService.updateItem(req.user!.id, Number(req.params.id), req.body.quantity));
  }),
);

cartRoutes.delete(
  '/items/:id',
  validate({ params: idParam }),
  catchAsync(async (req, res) => {
    ok(res, await cartService.removeItem(req.user!.id, Number(req.params.id)));
  }),
);

cartRoutes.delete(
  '/',
  catchAsync(async (req, res) => {
    ok(res, await cartService.clear(req.user!.id));
  }),
);
