"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
/** Operational error with an HTTP status and a stable machine-readable code. */
class ApiError extends Error {
    constructor(statusCode, message, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
        Error.captureStackTrace(this, this.constructor);
    }
    static badRequest(message, code = 'BAD_REQUEST', details) {
        return new ApiError(400, message, code, details);
    }
    static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
        return new ApiError(401, message, code);
    }
    static forbidden(message = 'You do not have permission to do this', code = 'FORBIDDEN') {
        return new ApiError(403, message, code);
    }
    static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
        return new ApiError(404, message, code);
    }
    static conflict(message, code = 'CONFLICT') {
        return new ApiError(409, message, code);
    }
    static tooMany(message = 'Too many requests, please slow down', code = 'RATE_LIMITED') {
        return new ApiError(429, message, code);
    }
    static internal(message = 'Something went wrong', code = 'INTERNAL_ERROR') {
        return new ApiError(500, message, code);
    }
}
exports.ApiError = ApiError;
//# sourceMappingURL=apiError.js.map