"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.hashToken = hashToken;
exports.generateActionToken = generateActionToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
function signAccessToken(userId, role) {
    const payload = { sub: userId, role, type: 'access' };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, {
        expiresIn: env_1.env.ACCESS_TOKEN_TTL,
    });
}
function verifyAccessToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
    if (decoded.type !== 'access')
        throw new Error('Invalid token type');
    return { sub: Number(decoded.sub), role: decoded.role, type: 'access' };
}
/**
 * Refresh tokens are opaque random strings. Only a SHA-256 hash is stored in
 * the database, so a database leak cannot be replayed as valid tokens.
 */
function generateRefreshToken() {
    const token = crypto_1.default.randomBytes(48).toString('base64url');
    return {
        token,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env_1.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    };
}
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
/** Random tokens for password reset / email verification links. */
function generateActionToken(ttlMinutes) {
    const token = crypto_1.default.randomBytes(32).toString('base64url');
    return {
        token,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    };
}
//# sourceMappingURL=jwt.js.map