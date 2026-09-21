import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Known operational errors
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error('api.error', { code: err.code, path: req.path, message: err.message });
    }
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Prisma known errors → friendly messages
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A record with this value already exists',
        code: 'DUPLICATE',
      });
    }
    if (err.code === 'P2025') {
      return res
        .status(404)
        .json({ success: false, message: 'Resource not found', code: 'NOT_FOUND' });
    }
  }

  // Body parser JSON errors
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res
      .status(400)
      .json({ success: false, message: 'Malformed JSON body', code: 'INVALID_JSON' });
  }

  // Multer file-size errors
  if (err && typeof err === 'object' && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ success: false, message: 'File is too large', code: 'FILE_TOO_LARGE' });
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error('api.unhandled_error', {
    path: req.path,
    message,
    stack: !isProd && err instanceof Error ? err.stack : undefined,
  });

  return res.status(500).json({
    success: false,
    message: isProd ? 'Something went wrong' : message,
    code: 'INTERNAL_ERROR',
  });
}
