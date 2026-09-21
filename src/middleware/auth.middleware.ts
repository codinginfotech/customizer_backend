import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';

export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Requires a valid access token; attaches req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    logger.info('auth.token_rejected', { path: req.path });
    return next(ApiError.unauthorized('Session expired or invalid', 'TOKEN_INVALID'));
  }
}

/** Attaches req.user when a valid token is present, but never fails. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      /* anonymous */
    }
  }
  next();
}

/** Role gate — use after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

/** Rejects disabled accounts on sensitive routes (DB-backed check). */
export async function requireActiveUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return next(ApiError.forbidden('Account is disabled', 'ACCOUNT_DISABLED'));
  }
  return next();
}
