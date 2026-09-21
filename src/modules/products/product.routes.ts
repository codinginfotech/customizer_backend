import { Router } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created, noContent, buildMeta } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { productService } from './product.service';
import { audit } from '../../services/audit.service';
import {
  createProductSchema,
  idParamSchema,
  listProductsQuerySchema,
  printAreaSchema,
  productChildParamSchema,
  productImageSchema,
  productModelSchema,
  slugParamSchema,
  updateProductSchema,
  variantSchema,
} from './product.validators';

export const productRoutes = Router();
const admin = [requireAuth, requireRole('ADMIN')] as const;

// ---------- public ----------
productRoutes.get(
  '/',
  validate({ query: listProductsQuerySchema }),
  catchAsync(async (req, res) => {
    const q = req.query as never as Parameters<typeof productService.list>[0];
    const result = await productService.list(q);
    ok(res, result.items, buildMeta(result.page, result.pageSize, result.total));
  }),
);

// Admin listing (includes inactive) — registered before /:slug so it matches first.
productRoutes.get(
  '/admin/all',
  ...admin,
  validate({ query: listProductsQuerySchema }),
  catchAsync(async (req, res) => {
    const q = req.query as never as Parameters<typeof productService.list>[0];
    const result = await productService.list(q, true);
    ok(res, result.items, buildMeta(result.page, result.pageSize, result.total));
  }),
);

productRoutes.get(
  '/admin/:id',
  ...admin,
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    ok(res, await productService.getById(Number(req.params.id)));
  }),
);

productRoutes.get(
  '/:slug',
  validate({ params: slugParamSchema }),
  catchAsync(async (req, res) => {
    ok(res, await productService.getBySlug(req.params.slug));
  }),
);

// ---------- admin: product CRUD ----------
productRoutes.post(
  '/',
  ...admin,
  validate({ body: createProductSchema }),
  catchAsync(async (req, res) => {
    const product = await productService.create(req.body);
    void audit(req.user!.id, 'product.created', 'product', product.id, { name: product.name });
    created(res, product);
  }),
);

productRoutes.put(
  '/:id',
  ...admin,
  validate({ params: idParamSchema, body: updateProductSchema }),
  catchAsync(async (req, res) => {
    const product = await productService.update(Number(req.params.id), req.body);
    void audit(req.user!.id, 'product.updated', 'product', product.id, {
      fields: Object.keys(req.body),
      version: product.version,
    });
    ok(res, product);
  }),
);

productRoutes.delete(
  '/:id',
  ...admin,
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    const result = await productService.remove(Number(req.params.id));
    void audit(req.user!.id, 'product.deleted', 'product', Number(req.params.id), result);
    ok(res, result);
  }),
);

// ---------- admin: variants ----------
productRoutes.post(
  '/:id/variants',
  ...admin,
  validate({ params: idParamSchema, body: variantSchema }),
  catchAsync(async (req, res) => {
    created(res, await productService.addVariant(Number(req.params.id), req.body));
  }),
);

productRoutes.put(
  '/:id/variants/:childId',
  ...admin,
  validate({ params: productChildParamSchema, body: variantSchema.partial() }),
  catchAsync(async (req, res) => {
    ok(
      res,
      await productService.updateVariant(Number(req.params.id), Number(req.params.childId), req.body),
    );
  }),
);

productRoutes.delete(
  '/:id/variants/:childId',
  ...admin,
  validate({ params: productChildParamSchema }),
  catchAsync(async (req, res) => {
    await productService.removeVariant(Number(req.params.id), Number(req.params.childId));
    noContent(res);
  }),
);

// ---------- admin: print areas ----------
productRoutes.post(
  '/:id/print-areas',
  ...admin,
  validate({ params: idParamSchema, body: printAreaSchema }),
  catchAsync(async (req, res) => {
    created(res, await productService.addPrintArea(Number(req.params.id), req.body));
  }),
);

productRoutes.put(
  '/:id/print-areas/:childId',
  ...admin,
  validate({ params: productChildParamSchema, body: printAreaSchema.partial() }),
  catchAsync(async (req, res) => {
    ok(
      res,
      await productService.updatePrintArea(
        Number(req.params.id),
        Number(req.params.childId),
        req.body,
      ),
    );
  }),
);

productRoutes.delete(
  '/:id/print-areas/:childId',
  ...admin,
  validate({ params: productChildParamSchema }),
  catchAsync(async (req, res) => {
    await productService.removePrintArea(Number(req.params.id), Number(req.params.childId));
    noContent(res);
  }),
);

// ---------- admin: images ----------
productRoutes.post(
  '/:id/images',
  ...admin,
  validate({ params: idParamSchema, body: productImageSchema }),
  catchAsync(async (req, res) => {
    created(res, await productService.addImage(Number(req.params.id), req.body));
  }),
);

productRoutes.delete(
  '/:id/images/:childId',
  ...admin,
  validate({ params: productChildParamSchema }),
  catchAsync(async (req, res) => {
    await productService.removeImage(Number(req.params.id), Number(req.params.childId));
    noContent(res);
  }),
);

// ---------- admin: 3D model ----------
productRoutes.put(
  '/:id/model',
  ...admin,
  validate({ params: idParamSchema, body: productModelSchema }),
  catchAsync(async (req, res) => {
    const model = await productService.upsertModel(Number(req.params.id), req.body);
    void audit(req.user!.id, 'product.model_updated', 'product', Number(req.params.id), {
      modelType: req.body.modelType,
      qualityScore: model.qualityScore,
    });
    ok(res, model);
  }),
);

productRoutes.delete(
  '/:id/model',
  ...admin,
  validate({ params: idParamSchema }),
  catchAsync(async (req, res) => {
    await productService.removeModel(Number(req.params.id));
    noContent(res);
  }),
);
