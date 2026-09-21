"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const auth_routes_1 = require("../modules/auth/auth.routes");
const user_routes_1 = require("../modules/users/user.routes");
const category_routes_1 = require("../modules/categories/category.routes");
const product_routes_1 = require("../modules/products/product.routes");
const design_routes_1 = require("../modules/designs/design.routes");
const upload_routes_1 = require("../modules/uploads/upload.routes");
const template_routes_1 = require("../modules/templates/template.routes");
const pricing_routes_1 = require("../modules/pricing/pricing.routes");
const cart_routes_1 = require("../modules/cart/cart.routes");
const order_routes_1 = require("../modules/orders/order.routes");
const export_routes_1 = require("../modules/export/export.routes");
const admin_routes_1 = require("../modules/admin/admin.routes");
const platform_routes_1 = require("../modules/platform/platform.routes");
const design_service_1 = require("../modules/designs/design.service");
const catchAsync_1 = require("../utils/catchAsync");
const respond_1 = require("../utils/respond");
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.use('/auth', auth_routes_1.authRoutes);
exports.apiRouter.use('/users', user_routes_1.userRoutes);
exports.apiRouter.use('/categories', category_routes_1.categoryRoutes);
exports.apiRouter.use('/products', product_routes_1.productRoutes);
exports.apiRouter.use('/designs', design_routes_1.designRoutes);
exports.apiRouter.use('/uploads', upload_routes_1.uploadRoutes);
exports.apiRouter.use('/templates', template_routes_1.templateRoutes);
exports.apiRouter.use('/pricing', pricing_routes_1.pricingRoutes);
exports.apiRouter.use('/cart', cart_routes_1.cartRoutes);
exports.apiRouter.use('/orders', order_routes_1.orderRoutes);
exports.apiRouter.use('/export', export_routes_1.exportRoutes);
exports.apiRouter.use('/admin', admin_routes_1.adminRoutes);
exports.apiRouter.use('/platform', platform_routes_1.platformRoutes);
/** Public, unauthenticated read of an explicitly shared design. */
exports.apiRouter.get('/public/designs/:token', (0, catchAsync_1.catchAsync)(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
        res.status(404).json({ success: false, message: 'Not found', code: 'SHARED_DESIGN_NOT_FOUND' });
        return;
    }
    (0, respond_1.ok)(res, await design_service_1.designService.getPublicByToken(token));
}));
exports.apiRouter.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});
//# sourceMappingURL=index.js.map