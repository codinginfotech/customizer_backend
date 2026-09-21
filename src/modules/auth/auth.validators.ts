import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().email('Enter a valid email address').max(190),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(1, 'Password is required').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(190),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: registerSchema.shape.password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({
  // Firebase ID tokens are JWTs; ~1–2 KB is typical, cap well above that.
  idToken: z.string().min(20).max(4096),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
