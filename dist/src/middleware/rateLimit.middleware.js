"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLimiter = exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
const failureResponse = {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
};
/** General API limiter. */
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: env_1.isTest ? 10_000 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: failureResponse,
});
/** Strict limiter for credential endpoints (login, register, password reset). */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: env_1.isTest ? 10_000 : 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: failureResponse,
});
/** Upload limiter — image processing is expensive. */
exports.uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: env_1.isTest ? 10_000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: failureResponse,
});
//# sourceMappingURL=rateLimit.middleware.js.map