"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logger_1 = require("../config/logger");
/** Structured request logging — path, method, status, duration. Never bodies. */
function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
        logger_1.logger.log(level === 'http' ? 'debug' : level, 'http.request', {
            method: req.method,
            path: req.originalUrl.split('?')[0],
            status: res.statusCode,
            ms: Math.round(durationMs),
            userId: req.user?.id,
        });
    });
    next();
}
//# sourceMappingURL=requestLogger.middleware.js.map