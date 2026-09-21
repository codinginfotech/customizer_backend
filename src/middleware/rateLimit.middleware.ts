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
  // Shopify app-proxy traffic arrives from Shopify's own egress IPs on behalf
  // of every shopper, so it gets its own per-store limiter instead.
  skip: (req) => req.originalUrl.startsWith('/api/shopify/proxy'),
});

/** App-proxy limiter keyed by store rather than client IP. */
export const shopifyProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: failureResponse,
  keyGenerator: (req) => String(req.query.shop || req.ip),
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
