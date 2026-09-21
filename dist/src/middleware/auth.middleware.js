"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
exports.requireRole = requireRole;
exports.requireActiveUser = requireActiveUser;
const jwt_1 = require("../utils/jwt");
const apiError_1 = require("../utils/apiError");
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../config/logger");
function extractToken(req) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer '))
        return header.slice(7);
    return null;
}
/** Requires a valid access token; attaches req.user. */
function requireAuth(req, _res, next) {
    const token = extractToken(req);
    if (!token)
        return next(apiError_1.ApiError.unauthorized());
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = { id: payload.sub, role: payload.role };
        return next();
    }
    catch {
        logger_1.logger.info('auth.token_rejected', { path: req.path });
        return next(apiError_1.ApiError.unauthorized('Session expired or invalid', 'TOKEN_INVALID'));
    }
}
/** Attaches req.user when a valid token is present, but never fails. */
function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (token) {
        try {
            const payload = (0, jwt_1.verifyAccessToken)(token);
            req.user = { id: payload.sub, role: payload.role };
        }
        catch {
            /* anonymous */
        }
    }
    next();
}
/** Role gate — use after requireAuth. */
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(apiError_1.ApiError.unauthorized());
        if (!roles.includes(req.user.role))
            return next(apiError_1.ApiError.forbidden());
        return next();
    };
}
/** Rejects disabled accounts on sensitive routes (DB-backed check). */
async function requireActiveUser(req, _res, next) {
    if (!req.user)
        return next(apiError_1.ApiError.unauthorized());
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
        return next(apiError_1.ApiError.forbidden('Account is disabled', 'ACCOUNT_DISABLED'));
    }
    return next();
}
//# sourceMappingURL=auth.middleware.js.map