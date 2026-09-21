"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const env_1 = require("./config/env");
const routes_1 = require("./routes");
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const requestLogger_middleware_1 = require("./middleware/requestLogger.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
const storage_1 = require("./storage");
function createApp() {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        // Uploaded images/models are consumed by the SPA on another origin.
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.use((0, cors_1.default)({
        origin: env_1.env.CLIENT_URL,
        credentials: true,
    }));
    app.use((0, cookie_parser_1.default)());
    // Design JSON + base64 previews can be sizable; still capped.
    app.use(express_1.default.json({ limit: '8mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
    app.use(requestLogger_middleware_1.requestLogger);
    // Local-storage uploads (development). In production with S3, files are
    // served from the bucket/CDN and this path simply stays empty.
    app.use('/uploads', express_1.default.static(storage_1.UPLOAD_ROOT, {
        fallthrough: true,
        immutable: true,
        maxAge: '30d',
        setHeaders: (res) => {
            // Never execute anything from the uploads directory.
            res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
            res.setHeader('X-Content-Type-Options', 'nosniff');
        },
    }));
    app.use('/api', rateLimit_middleware_1.apiLimiter, routes_1.apiRouter);
    app.use(error_middleware_1.notFoundHandler);
    app.use(error_middleware_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map