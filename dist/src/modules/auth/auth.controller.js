"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_COOKIE = exports.authController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const respond_1 = require("../../utils/respond");
const auth_service_1 = require("./auth.service");
const env_1 = require("../../config/env");
const REFRESH_COOKIE = 'cpd_refresh';
exports.REFRESH_COOKIE = REFRESH_COOKIE;
function setRefreshCookie(res, tokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        secure: env_1.isProd,
        sameSite: 'lax',
        path: '/api/auth',
        expires: tokens.refreshExpiresAt,
    });
}
function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
exports.authController = {
    register: (0, catchAsync_1.catchAsync)(async (req, res) => {
        const { name, email, password } = req.body;
        const { user, tokens } = await auth_service_1.authService.register(name, email, password);
        setRefreshCookie(res, tokens);
        (0, respond_1.created)(res, { user, accessToken: tokens.accessToken });
    }),
    login: (0, catchAsync_1.catchAsync)(async (req, res) => {
        const { email, password } = req.body;
        const { user, tokens } = await auth_service_1.authService.login(email, password);
        setRefreshCookie(res, tokens);
        (0, respond_1.ok)(res, { user, accessToken: tokens.accessToken });
    }),
    refresh: (0, catchAsync_1.catchAsync)(async (req, res) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token) {
            res.status(401).json({ success: false, message: 'No session', code: 'NO_REFRESH_TOKEN' });
            return;
        }
        const { user, tokens } = await auth_service_1.authService.refresh(token);
        setRefreshCookie(res, tokens);
        (0, respond_1.ok)(res, { user, accessToken: tokens.accessToken });
    }),
    logout: (0, catchAsync_1.catchAsync)(async (req, res) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        await auth_service_1.authService.logout(token);
        clearRefreshCookie(res);
        (0, respond_1.ok)(res, { loggedOut: true });
    }),
    me: (0, catchAsync_1.catchAsync)(async (req, res) => {
        const user = await auth_service_1.authService.me(req.user.id);
        (0, respond_1.ok)(res, { user });
    }),
    forgotPassword: (0, catchAsync_1.catchAsync)(async (req, res) => {
        await auth_service_1.authService.forgotPassword(req.body.email);
        (0, respond_1.ok)(res, { message: 'If that email exists, a reset link has been sent.' });
    }),
    resetPassword: (0, catchAsync_1.catchAsync)(async (req, res) => {
        await auth_service_1.authService.resetPassword(req.body.token, req.body.password);
        (0, respond_1.ok)(res, { message: 'Password updated. You can now sign in.' });
    }),
    verifyEmail: (0, catchAsync_1.catchAsync)(async (req, res) => {
        await auth_service_1.authService.verifyEmail(req.body.token);
        (0, respond_1.ok)(res, { message: 'Email verified.' });
    }),
};
//# sourceMappingURL=auth.controller.js.map