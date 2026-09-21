"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const client_1 = require("@prisma/client");
const apiError_1 = require("../utils/apiError");
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
function notFoundHandler(req, _res, next) {
    next(apiError_1.ApiError.notFound(`Route not found: ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, req, res, _next) {
    // Known operational errors
    if (err instanceof apiError_1.ApiError) {
        if (err.statusCode >= 500) {
            logger_1.logger.error('api.error', { code: err.code, path: req.path, message: err.message });
        }
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            code: err.code,
            ...(err.details ? { details: err.details } : {}),
        });
    }
    // Prisma known errors → friendly messages
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
    if (err instanceof SyntaxError && 'body' in err) {
        return res
            .status(400)
            .json({ success: false, message: 'Malformed JSON body', code: 'INVALID_JSON' });
    }
    // Multer file-size errors
    if (err && typeof err === 'object' && err.code === 'LIMIT_FILE_SIZE') {
        return res
            .status(413)
            .json({ success: false, message: 'File is too large', code: 'FILE_TOO_LARGE' });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger_1.logger.error('api.unhandled_error', {
        path: req.path,
        message,
        stack: !env_1.isProd && err instanceof Error ? err.stack : undefined,
    });
    return res.status(500).json({
        success: false,
        message: env_1.isProd ? 'Something went wrong' : message,
        code: 'INTERNAL_ERROR',
    });
}
//# sourceMappingURL=error.middleware.js.map