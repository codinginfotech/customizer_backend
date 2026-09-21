import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { apiRouter } from './routes';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { requestLogger } from './middleware/requestLogger.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { UPLOAD_ROOT } from './storage';

export function createApp() {
  const app = express();

  // Number of proxy hops in front of the API (see TRUST_PROXY in .env). Getting
  // this wrong makes every client share one rate-limit bucket.
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      // Uploaded images/models are consumed by the SPA on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  // Design JSON + base64 previews can be sizable; still capped.
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  // Local-storage uploads (development). In production with S3, files are
  // served from the bucket/CDN and this path simply stays empty.
  app.use(
    '/uploads',
    express.static(UPLOAD_ROOT, {
      fallthrough: true,
      immutable: true,
      maxAge: '30d',
      setHeaders: (res) => {
        // Never execute anything from the uploads directory.
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.use('/api', apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
