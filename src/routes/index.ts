import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { userRoutes } from '../modules/users/user.routes';
import { categoryRoutes } from '../modules/categories/category.routes';
import { productRoutes } from '../modules/products/product.routes';
import { designRoutes } from '../modules/designs/design.routes';
import { uploadRoutes } from '../modules/uploads/upload.routes';
import { templateRoutes } from '../modules/templates/template.routes';
import { pricingRoutes } from '../modules/pricing/pricing.routes';
import { cartRoutes } from '../modules/cart/cart.routes';
import { orderRoutes } from '../modules/orders/order.routes';
import { exportRoutes } from '../modules/export/export.routes';
import { adminRoutes } from '../modules/admin/admin.routes';
import { platformRoutes } from '../modules/platform/platform.routes';
import { designService } from '../modules/designs/design.service';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/respond';

export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/designs', designRoutes);
apiRouter.use('/uploads', uploadRoutes);
apiRouter.use('/templates', templateRoutes);
apiRouter.use('/pricing', pricingRoutes);
apiRouter.use('/cart', cartRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/export', exportRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/platform', platformRoutes);

/** Public, unauthenticated read of an explicitly shared design. */
apiRouter.get(
  '/public/designs/:token',
  catchAsync(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
      res.status(404).json({ success: false, message: 'Not found', code: 'SHARED_DESIGN_NOT_FOUND' });
      return;
    }
    ok(res, await designService.getPublicByToken(token));
  }),
);

apiRouter.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});
