"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const env_1 = require("./env");
/**
 * Structured application logger. Never log passwords, tokens or PII —
 * callers are responsible for sanitizing metadata before logging.
 */
exports.logger = winston_1.default.createLogger({
    level: env_1.isProd ? 'info' : 'debug',
    format: env_1.isProd
        ? winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json())
        : winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
            const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level} ${message}${rest}`;
        })),
    transports: [new winston_1.default.transports.Console({ silent: env_1.env.NODE_ENV === 'test' })],
});
//# sourceMappingURL=logger.js.map