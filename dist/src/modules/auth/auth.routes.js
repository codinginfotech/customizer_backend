"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../../middleware/rateLimit.middleware");
const auth_validators_1 = require("./auth.validators");
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post('/register', rateLimit_middleware_1.authLimiter, (0, validate_middleware_1.validate)({ body: auth_validators_1.registerSchema }), auth_controller_1.authController.register);
exports.authRoutes.post('/login', rateLimit_middleware_1.authLimiter, (0, validate_middleware_1.validate)({ body: auth_validators_1.loginSchema }), auth_controller_1.authController.login);
exports.authRoutes.post('/refresh', auth_controller_1.authController.refresh);
exports.authRoutes.post('/logout', auth_controller_1.authController.logout);
exports.authRoutes.get('/me', auth_middleware_1.requireAuth, auth_controller_1.authController.me);
exports.authRoutes.post('/forgot-password', rateLimit_middleware_1.authLimiter, (0, validate_middleware_1.validate)({ body: auth_validators_1.forgotPasswordSchema }), auth_controller_1.authController.forgotPassword);
exports.authRoutes.post('/reset-password', rateLimit_middleware_1.authLimiter, (0, validate_middleware_1.validate)({ body: auth_validators_1.resetPasswordSchema }), auth_controller_1.authController.resetPassword);
exports.authRoutes.post('/verify-email', (0, validate_middleware_1.validate)({ body: auth_validators_1.verifyEmailSchema }), auth_controller_1.authController.verifyEmail);
//# sourceMappingURL=auth.routes.js.map