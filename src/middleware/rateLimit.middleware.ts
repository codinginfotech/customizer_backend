import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const failureResponse = {
  success: false,
  message: 'Too many requests, please try again later',
  code: 'RATE_LIMITED',
};

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: failureResponse,
});

/** Strict limiter for credential endpoints (login, register, password reset). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: failureResponse,
});

/** Upload limiter — image processing is expensive. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: failureResponse,
});
