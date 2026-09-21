import { Router } from 'express';
import { z } from 'zod';
import { ANALYTICS_EVENTS } from '@cpd/shared';
import { catchAsync } from '../../utils/catchAsync';
import { ok } from '../../utils/respond';
import { validate } from '../../middleware/validate.middleware';
import { optionalAuth } from '../../middleware/auth.middleware';
import { logger } from '../../config/logger';

/**
 * Platform-level endpoints: feature flags and analytics events.
 *
 * Flags are environment-driven so features can be toggled per deployment
 * without code changes. Events are typed (no free-form payload keys beyond a
 * small allow-list) and privacy-safe: only ids/counts, logged structurally
 * for downstream aggregation — no PII, no design content.
 */

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export function getFeatureFlags() {
  return {
    ENABLE_3D_EDITOR: flag('ENABLE_3D_EDITOR', true),
    ENABLE_ADVANCED_MODE: flag('ENABLE_ADVANCED_MODE', true),
    ENABLE_PUBLIC_DESIGNS: flag('ENABLE_PUBLIC_DESIGNS', true),
    ENABLE_DESIGN_TRANSFER: flag('ENABLE_DESIGN_TRANSFER', true),
    ENABLE_AR: flag('ENABLE_AR', false),
    ENABLE_EMBROIDERY: flag('ENABLE_EMBROIDERY', false),
  } as const;
}

const eventSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  props: z
    .object({
      productId: z.number().int().positive().optional(),
      designId: z.number().int().positive().optional(),
      areaKey: z.string().max(64).optional(),
      value: z.number().optional(),
    })
    .default({}),
});

export const platformRoutes = Router();

platformRoutes.get('/flags', (_req, res) => {
  ok(res, getFeatureFlags());
});

platformRoutes.post(
  '/events',
  optionalAuth,
  validate({ body: eventSchema }),
  catchAsync(async (req, res) => {
    logger.info('analytics.event', {
      event: req.body.name,
      ...req.body.props,
      userId: req.user?.id,
    });
    ok(res, { recorded: true });
  }),
);
