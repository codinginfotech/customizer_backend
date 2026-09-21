import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { ok, created } from '../../utils/respond';
import { authService, AuthTokens } from './auth.service';
import { env, isProd } from '../../config/env';

const REFRESH_COOKIE = 'cpd_refresh';

function setRefreshCookie(res: Response, tokens: AuthTokens) {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    expires: tokens.refreshExpiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    const { user, tokens } = await authService.register(name, email, password);
    setRefreshCookie(res, tokens);
    created(res, { user, accessToken: tokens.accessToken });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const { user, tokens } = await authService.login(email, password);
    setRefreshCookie(res, tokens);
    ok(res, { user, accessToken: tokens.accessToken });
  }),

  google: catchAsync(async (req: Request, res: Response) => {
    const { user, tokens } = await authService.loginWithGoogle(req.body.idToken);
    setRefreshCookie(res, tokens);
    ok(res, { user, accessToken: tokens.accessToken });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({ success: false, message: 'No session', code: 'NO_REFRESH_TOKEN' });
      return;
    }
    const { user, tokens } = await authService.refresh(token);
    setRefreshCookie(res, tokens);
    ok(res, { user, accessToken: tokens.accessToken });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await authService.logout(token);
    clearRefreshCookie(res);
    ok(res, { loggedOut: true });
  }),

  me: catchAsync(async (req: Request, res: Response) => {
    const user = await authService.me(req.user!.id);
    ok(res, { user });
  }),

  forgotPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);
    ok(res, { message: 'If that email exists, a reset link has been sent.' });
  }),

  resetPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body.token, req.body.password);
    ok(res, { message: 'Password updated. You can now sign in.' });
  }),

  verifyEmail: catchAsync(async (req: Request, res: Response) => {
    await authService.verifyEmail(req.body.token);
    ok(res, { message: 'Email verified.' });
  }),
};

export { REFRESH_COOKIE };
