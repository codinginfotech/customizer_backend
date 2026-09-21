import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validators';

export const authRoutes = Router();

authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRoutes.post('/google', authLimiter, validate({ body: googleLoginSchema }), authController.google);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
authRoutes.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
authRoutes.post('/verify-email', validate({ body: verifyEmailSchema }), authController.verifyEmail);
