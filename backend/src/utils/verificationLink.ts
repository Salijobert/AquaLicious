import admin from 'firebase-admin';
import { config } from '../config/index.js';

/**
 * Generates a Firebase email verification action code via Firebase Admin SDK
 * and wraps it into our own clean frontend landing URL (${FRONTEND_URL}/verify-email-complete).
 * Never emits the default firebaseapp.com handler URL or any local HMAC bypass token.
 */
export async function buildFirebaseVerificationLink(email: string, name?: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  let oobCode = '';

  if (admin.apps.length > 0) {
    try {
      try {
        await admin.auth().getUserByEmail(cleanEmail);
      } catch {
        await admin.auth().createUser({
          email: cleanEmail,
          ...(name ? { displayName: name } : {}),
          emailVerified: false
        });
      }

      const rawLink = await admin.auth().generateEmailVerificationLink(cleanEmail, {
        url: `${config.frontendUrl}/verify-email-complete`
      });

      const parsed = new URL(rawLink);
      oobCode = parsed.searchParams.get('oobCode') || '';
    } catch (err: any) {
      console.warn('[Auth] Firebase generateEmailVerificationLink warning:', err.message);
    }
  }

  const query = new URLSearchParams({
    mode: 'verifyEmail'
  });
  if (oobCode) {
    query.set('oobCode', oobCode);
  }

  return `${config.frontendUrl}/verify-email-complete?${query.toString()}`;
}
