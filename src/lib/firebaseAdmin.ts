import { App, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

/**
 * Identity claims we trust from a verified Firebase ID token. Verification
 * only needs the project ID — the Admin SDK fetches Google's public keys —
 * so no service-account credentials are required for sign-in.
 */
export interface VerifiedIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export type IdTokenVerifier = (idToken: string) => Promise<VerifiedIdentity>;

let app: App | null = null;

function getApp(): App {
  if (!env.FIREBASE_PROJECT_ID) {
    throw new ApiError(503, 'Google sign-in is not enabled on this server', 'GOOGLE_AUTH_DISABLED');
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }
  return app;
}

export const verifyFirebaseIdToken: IdTokenVerifier = async (idToken) => {
  const auth = getAuth(getApp());
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw ApiError.unauthorized('Google sign-in could not be verified', 'GOOGLE_TOKEN_INVALID');
  }
  if (!decoded.email) {
    throw ApiError.badRequest('Google account has no email address', 'GOOGLE_EMAIL_MISSING');
  }
  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified === true,
    name: typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim() : null,
  };
};
