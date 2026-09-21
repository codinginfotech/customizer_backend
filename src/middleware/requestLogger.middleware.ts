import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

/** Structured request logging — path, method, status, duration. Never bodies. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level === 'http' ? 'debug' : level, 'http.request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(durationMs),
      userId: req.user?.id,
    });
  });
  next();
}
