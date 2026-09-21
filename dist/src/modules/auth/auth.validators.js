"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(120),
    email: zod_1.z.string().email('Enter a valid email address').max(190),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128)
        .regex(/[a-zA-Z]/, 'Password must contain a letter')
        .regex(/[0-9]/, 'Password must contain a number'),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(190),
    password: zod_1.z.string().min(1, 'Password is required').max(128),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(190),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(10).max(200),
    password: exports.registerSchema.shape.password,
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(10).max(200),
});
//# sourceMappingURL=auth.validators.js.map