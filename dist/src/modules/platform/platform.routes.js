"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRoutes = void 0;
exports.getFeatureFlags = getFeatureFlags;
const express_1 = require("express");
const zod_1 = require("zod");
const shared_1 = require("@cpd/shared");
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const logger_1 = require("../../config/logger");
/**
 * Platform-level endpoints: feature flags and analytics events.
 *
 * Flags are environment-driven so features can be toggled per deployment
 * without code changes. Events are typed (no free-form payload keys beyond a
 * small allow-list) and privacy-safe: only ids/counts, logged structurally
 * for downstream aggregation — no PII, no design content.
 */
function flag(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined)
        return defaultValue;
    return raw === '1' || raw.toLowerCase() === 'true';
}
function getFeatureFlags() {
    return {
        ENABLE_3D_EDITOR: flag('ENABLE_3D_EDITOR', true),
        ENABLE_ADVANCED_MODE: flag('ENABLE_ADVANCED_MODE', true),
        ENABLE_PUBLIC_DESIGNS: flag('ENABLE_PUBLIC_DESIGNS', true),
        ENABLE_DESIGN_TRANSFER: flag('ENABLE_DESIGN_TRANSFER', true),
        ENABLE_AR: flag('ENABLE_AR', false),
        ENABLE_EMBROIDERY: flag('ENABLE_EMBROIDERY', false),
    };
}
const eventSchema = zod_1.z.object({
    name: zod_1.z.enum(shared_1.ANALYTICS_EVENTS),
    props: zod_1.z
        .object({
        productId: zod_1.z.number().int().positive().optional(),
        designId: zod_1.z.number().int().positive().optional(),
        areaKey: zod_1.z.string().max(64).optional(),
        value: zod_1.z.number().optional(),
    })
        .default({}),
});
exports.platformRoutes = (0, express_1.Router)();
exports.platformRoutes.get('/flags', (_req, res) => {
    (0, respond_1.ok)(res, getFeatureFlags());
});
exports.platformRoutes.post('/events', auth_middleware_1.optionalAuth, (0, validate_middleware_1.validate)({ body: eventSchema }), (0, catchAsync_1.catchAsync)(async (req, res) => {
    logger_1.logger.info('analytics.event', {
        event: req.body.name,
        ...req.body.props,
        userId: req.user?.id,
    });
    (0, respond_1.ok)(res, { recorded: true });
}));
//# sourceMappingURL=platform.routes.js.map