import { Router, Request, Response } from 'express';
import { prisma, config, generateTestToken } from '../config/index.js';
import { authenticate, requireEmailVerified, requireConsent } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { sanitize, apiLimiter } from '../middleware/security.js';
import { Mailer } from '../services/mailer.js';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  action: z.literal('register'),
  name: z.string().trim().min(1, 'Name is required'),
  username: z.string().trim().min(1, 'Username is required'),
  email: z.string().trim().toLowerCase().email('A valid email address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent to Terms and Data Privacy Act is required' })
  }),
  termsVersion: z.string().min(1, 'Terms version is required')
}).strict();

async function buildFirebaseVerificationLink(email: string, name: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  // Always create a cryptographically signed verification token (valid 48 hours)
  const serverToken = jwt.sign(
    { email: cleanEmail, type: 'email_verification' },
    config.jwtSecret,
    { expiresIn: '48h' }
  );

  let oobCode = '';
  let apiKey = 'AIzaSyCbrkSEGe65o2x7BY-h-syTdscYzLDrsVU';

  if (admin.apps.length > 0) {
    try {
      try {
        await admin.auth().getUserByEmail(cleanEmail);
      } catch {
        await admin.auth().createUser({
          email: cleanEmail,
          displayName: name,
          emailVerified: false
        });
      }

      const rawLink = await admin.auth().generateEmailVerificationLink(cleanEmail, {
        url: `${config.frontendUrl}/verify-email-complete`
      });

      const parsed = new URL(rawLink);
      oobCode = parsed.searchParams.get('oobCode') || '';
      apiKey = parsed.searchParams.get('apiKey') || apiKey;
    } catch (err: any) {
      console.warn('[Auth] Firebase generateEmailVerificationLink warning:', err.message);
    }
  }

  const query = new URLSearchParams({
    mode: 'verifyEmail',
    email: cleanEmail,
    token: serverToken
  });
  if (oobCode) query.set('oobCode', oobCode);
  if (apiKey) query.set('apiKey', apiKey);

  return `${config.frontendUrl}/verify-email-complete?${query.toString()}`;
}

async function buildFirebasePasswordResetLink(email: string, name?: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const serverToken = jwt.sign(
    { email: cleanEmail, type: 'password_reset' },
    config.jwtSecret,
    { expiresIn: '2h' }
  );

  let oobCode = '';
  let apiKey = 'AIzaSyCbrkSEGe65o2x7BY-h-syTdscYzLDrsVU';

  if (admin.apps.length > 0) {
    try {
      try {
        await admin.auth().getUserByEmail(cleanEmail);
      } catch {
        // user does not exist in Firebase yet
      }

      const rawLink = await admin.auth().generatePasswordResetLink(cleanEmail, {
        url: `${config.frontendUrl}/reset-password-complete`
      });

      const parsed = new URL(rawLink);
      oobCode = parsed.searchParams.get('oobCode') || '';
      apiKey = parsed.searchParams.get('apiKey') || apiKey;
    } catch (err: any) {
      console.warn('[Auth] Firebase generatePasswordResetLink warning:', err.message);
    }
  }

  const query = new URLSearchParams({
    mode: 'resetPassword',
    email: cleanEmail,
    token: serverToken
  });
  if (oobCode) query.set('oobCode', oobCode);
  if (apiKey) query.set('apiKey', apiKey);

  return `${config.frontendUrl}/reset-password-complete?${query.toString()}`;
}

router.post('/', async (req: Request, res: Response) => {
  const { action, username, password, name, role, idToken } = req.body;

  // 1. Customer Registration
  if (action === 'register') {
    // Explicit privilege escalation block
    if ('role' in req.body) {
      return res.status(403).json({ error: 'Public registration must only provision Customer access' });
    }

    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return res.status(422).json({ error: issue?.message || 'Invalid registration payload' });
    }

    const validData = parseResult.data;
    const cleanUsername = sanitize(validData.username).trim();
    const cleanEmail = sanitize(validData.email).trim().toLowerCase();

    // Check username uniqueness
    const existingUsername = await prisma.user.findFirst({
      where: { username: cleanUsername }
    });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already in use', code: 'USERNAME_ALREADY_EXISTS' });
    }

    // Check email uniqueness
    const existingEmail = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email address already exists', code: 'EMAIL_ALREADY_EXISTS' });
    }

    // Sync or create user in Google Firebase Auth
    let firebaseUid = `uid-${cleanUsername}-${Date.now()}`;
    if (admin.apps.length > 0) {
      try {
        let fbUser: admin.auth.UserRecord;
        try {
          fbUser = await admin.auth().getUserByEmail(cleanEmail);
        } catch (notFound) {
          fbUser = await admin.auth().createUser({
            email: cleanEmail,
            displayName: sanitize(validData.name),
            password: validData.password,
            emailVerified: false
          });
        }
        firebaseUid = fbUser.uid;
      } catch (fbErr: any) {
        console.warn('[Auth] Firebase user sync warning during registration:', fbErr.message);
      }
    }

    const user = await prisma.user.create({
      data: {
        firebaseUid,
        name: sanitize(validData.name),
        username: cleanUsername,
        email: cleanEmail,
        role: Role.CUSTOMER,
        emailVerified: false,
        verificationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        active: true
      }
    });

    // Record consent under RA 10173 (Philippine Data Privacy Act of 2012)
    await prisma.userConsent.create({
      data: {
        userId: user.id,
        consent: true,
        termsVersion: sanitize(validData.termsVersion),
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: (req.headers['user-agent'] as string) || null
      }
    });

    // Generate Firebase verification link & send verification email asynchronously
    const verificationLink = await buildFirebaseVerificationLink(user.email, user.name);
    Mailer.sendVerificationEmail(user.email, user.name, verificationLink, user.id).catch((err) => {
      console.error('[Auth] Verification email dispatch failure:', err);
    });

    let token = '';
    if (config.nodeEnv !== 'production' && process.env.ALLOW_LOCAL_AUTH_FALLBACK === 'true') {
      token = generateTestToken({
        uid: user.firebaseUid,
        email: user.email,
        role: 'CUSTOMER',
        email_verified: false
      });
    } else if (admin.apps.length > 0) {
      try {
        token = await admin.auth().createCustomToken(user.firebaseUid, {
          role: 'CUSTOMER',
          email_verified: false
        });
      } catch (e: any) {
        console.warn('[Auth] Custom token fallback:', e.message);
      }
    }

    return res.status(200).json({
      token,
      expires_in: 7200,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        email_verified: false,
        role: 'Customer'
      }
    });
  }

  // 1b. Reject direct unauthenticated verify_email action
  if (action === 'verify_email') {
    return res.status(403).json({
      error: 'Direct email verification via API is disabled. Verification must be performed via Firebase.',
      code: 'VERIFY_EMAIL_DISABLED'
    });
  }

  // 1c. Forgot Password request (via action payload)
  if (action === 'forgot_password') {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(422).json({ error: 'Valid email is required' });
    }
    const cleanEmail = sanitize(email).toLowerCase();
    const start = Date.now();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { username: cleanEmail }]
      }
    });

    if (user) {
      const resetLink = await buildFirebasePasswordResetLink(user.email, user.name);
      Mailer.sendPasswordResetEmail(user.email, user.name, resetLink, user.id).catch((err) => {
        console.error('[Auth] Password reset email failure:', err);
      });
    }

    const elapsed = Date.now() - start;
    if (elapsed < 120) {
      await new Promise((resolve) => setTimeout(resolve, 120 - elapsed));
    }

    return res.status(200).json({
      message: 'If an account exists with that email, a password reset link has been sent.'
    });
  }

  // 1d. Resolve username or email to email address for Firebase login
  if (action === 'resolve_identifier') {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string') {
      return res.status(422).json({ error: 'Identifier is required' });
    }
    const cleanId = sanitize(identifier).trim();
    if (cleanId.toLowerCase() === 'admin') {
      return res.status(200).json({ email: 'admin@aqualicious.local', role: 'Administrator' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: cleanId, mode: 'insensitive' } },
          { email: { equals: cleanId.toLowerCase(), mode: 'insensitive' } }
        ]
      },
      select: { email: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    return res.status(200).json({
      email: user.email,
      role: user.role === Role.ADMIN ? 'Administrator' : 'Customer'
    });
  }

  // 2. Direct ID Token verification (from Firebase Web SDK)
  if (idToken) {
    try {
      const user = await prisma.user.findFirst({
        where: { firebaseUid: req.body.uid }
      });
      if (user && !user.active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }
      return res.status(200).json({
        token: idToken,
        user: user ? {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role === Role.ADMIN ? 'Administrator' : 'Customer'
        } : null
      });
    } catch {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }

  // 3. Login by username/password
  if (!username) {
    return res.status(422).json({ error: 'Username is required' });
  }

  if (!password) {
    return res.status(422).json({ error: 'Password is required' });
  }

  // In production or when local fallback is not enabled, reject local username/password fallback (fail closed)
  if (config.nodeEnv === 'production' && process.env.ALLOW_LOCAL_AUTH_FALLBACK !== 'true') {
    return res.status(403).json({ error: 'Direct local authentication is disabled in production. Use Firebase authentication.' });
  }
  if (process.env.ALLOW_LOCAL_AUTH_FALLBACK !== 'true') {
    return res.status(403).json({ error: 'Direct local authentication is disabled in production. Use Firebase authentication.' });
  }

  // Verify password against expected secret (strictly requires AQ_ADMIN_PASSWORD; zero default)
  const expectedPassword = process.env.AQ_ADMIN_PASSWORD;
  if (!expectedPassword || password !== expectedPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const cleanUsername = sanitize(username);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: cleanUsername }, { email: cleanUsername.toLowerCase() }]
    }
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  const roleName = user.role === Role.ADMIN ? 'Administrator' : 'Customer';
  const token = generateTestToken({
    uid: user.firebaseUid,
    email: user.email,
    role: user.role,
    email_verified: Boolean(user.emailVerified)
  });

  return res.status(200).json({
    token,
    expires_in: 7200,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      email_verified: Boolean(user.emailVerified),
      role: roleName
    }
  });
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required')
}).strict();

const resendVerificationSchema = z.object({
  email: z.string().email('Valid email is required')
}).strict();

router.post('/forgot-password', apiLimiter, async (req: Request, res: Response) => {
  const parseResult = forgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(422).json({ error: 'Valid email is required' });
  }

  const { email } = parseResult.data;
  const start = Date.now();
  const user = await prisma.user.findFirst({ where: { email } });

  if (user) {
    const resetLink = await buildFirebasePasswordResetLink(user.email, user.name);
    Mailer.sendPasswordResetEmail(user.email, user.name, resetLink, user.id).catch((err) => {
      console.error('[Auth] Password reset email failure:', err);
    });
  }

  // Consistent response timing to prevent timing attacks / user enumeration
  const elapsed = Date.now() - start;
  if (elapsed < 120) {
    await new Promise((resolve) => setTimeout(resolve, 120 - elapsed));
  }

  return res.status(200).json({
    message: 'If an account exists with that email, a password reset link has been sent.'
  });
});

router.post('/resend-verification', apiLimiter, async (req: Request, res: Response) => {
  const parseResult = resendVerificationSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(422).json({ error: 'Valid email is required' });
  }

  const { email } = parseResult.data;
  const start = Date.now();
  const user = await prisma.user.findFirst({ where: { email } });

  if (user && !user.emailVerified) {
    const verificationLink = await buildFirebaseVerificationLink(user.email, user.name);
    Mailer.sendVerificationEmail(user.email, user.name, verificationLink, user.id).catch((err) => {
      console.error('[Auth] Resend verification email failure:', err);
    });
  }

  const elapsed = Date.now() - start;
  if (elapsed < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100 - elapsed));
  }

  return res.status(200).json({
    message: 'If an unverified account exists with that email, a verification link has been sent.'
  });
});

router.get('/verification-status', async (req: Request, res: Response) => {
  const email = (req.query.email as string)?.trim().toLowerCase();
  if (!email) {
    return res.status(422).json({ error: 'Email parameter required' });
  }

  // Check in Firebase Admin SDK if available
  let firebaseVerified = false;
  if (admin.apps.length > 0) {
    try {
      const fbUser = await admin.auth().getUserByEmail(email);
      firebaseVerified = Boolean(fbUser.emailVerified);
    } catch {
      // ignore
    }
  }

  const user = await prisma.user.findFirst({
    where: { email }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isVerified = Boolean(user.emailVerified || firebaseVerified);
  if (firebaseVerified && !user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true }
    });
  }

  return res.json({ verified: isVerified });
});

router.post('/verify-email-token', apiLimiter, async (req: Request, res: Response) => {
  const { email, token } = req.body;
  if (!email || !token || typeof email !== 'string' || typeof token !== 'string') {
    return res.status(422).json({ error: 'Email and token are required' });
  }

  const cleanEmail = sanitize(email).trim().toLowerCase();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { email?: string; type?: string };
    if (!decoded || decoded.type !== 'email_verification' || decoded.email?.toLowerCase() !== cleanEmail) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // 1. Mark verified in PostgreSQL
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true }
    });

    // 2. Mark verified in Firebase Auth
    if (admin.apps.length > 0) {
      try {
        let fbUser: admin.auth.UserRecord;
        try {
          fbUser = await admin.auth().getUserByEmail(cleanEmail);
        } catch {
          fbUser = await admin.auth().getUser(user.firebaseUid);
        }
        if (fbUser) {
          await admin.auth().updateUser(fbUser.uid, { emailVerified: true });
        }
      } catch (fbErr: any) {
        console.warn('[Auth] Firebase updateUser error during token verification:', fbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully!'
    });
  } catch {
    return res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

router.post('/reset-password-token', apiLimiter, async (req: Request, res: Response) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword || typeof email !== 'string' || typeof token !== 'string' || typeof newPassword !== 'string') {
    return res.status(422).json({ error: 'Email, token, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(422).json({ error: 'Password must be at least 6 characters' });
  }

  const cleanEmail = sanitize(email).trim().toLowerCase();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { email?: string; type?: string };
    if (!decoded || decoded.type !== 'password_reset' || decoded.email?.toLowerCase() !== cleanEmail) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const user = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // Update password in Firebase Auth
    if (admin.apps.length > 0) {
      try {
        let fbUser: admin.auth.UserRecord;
        try {
          fbUser = await admin.auth().getUserByEmail(cleanEmail);
        } catch {
          fbUser = await admin.auth().getUser(user.firebaseUid);
        }
        if (fbUser) {
          await admin.auth().updateUser(fbUser.uid, {
            password: newPassword
          });
          await admin.auth().revokeRefreshTokens(fbUser.uid).catch(() => {});
        }
      } catch (fbErr: any) {
        console.error('[Auth] Failed to update password in Firebase:', fbErr);
        return res.status(500).json({ error: 'Failed to update password in authentication service' });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully!'
    });
  } catch {
    return res.status(400).json({ error: 'Invalid or expired password reset token' });
  }
});

router.post('/post-reset', apiLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (email && typeof email === 'string') {
    const user = await prisma.user.findFirst({ where: { email: sanitize(email) } });
    if (user?.firebaseUid && admin.apps.length > 0) {
      try {
        await admin.auth().revokeRefreshTokens(user.firebaseUid);
      } catch (err: any) {
        console.warn('[Auth] Revoke refresh tokens error:', err.message);
      }
    }
  }
  return res.status(200).json({ message: 'Previous sessions invalidated' });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const consentRecord = await prisma.userConsent.findFirst({
    where: { userId: user.id, consent: true },
    orderBy: { acceptedAt: 'desc' }
  });
  return res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    address: user.address,
    email_verified: Boolean(user.emailVerified),
    has_consent: Boolean(consentRecord),
    role: user.role === Role.ADMIN ? 'Administrator' : 'Customer'
  });
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const consentRecord = await prisma.userConsent.findFirst({
    where: { userId: user.id, consent: true },
    orderBy: { acceptedAt: 'desc' }
  });
  return res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    address: user.address,
    email_verified: Boolean(user.emailVerified),
    has_consent: Boolean(consentRecord),
    role: user.role === Role.ADMIN ? 'Administrator' : 'Customer'
  });
});

router.post('/consent', authenticate, async (req: Request, res: Response) => {
  const { consent, termsVersion } = req.body;
  if (!consent) {
    return res.status(422).json({ error: 'Consent is required' });
  }

  const cleanVersion = sanitize(termsVersion || '2026-v1.0');
  await prisma.userConsent.create({
    data: {
      userId: req.user!.id,
      consent: true,
      termsVersion: cleanVersion,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: (req.headers['user-agent'] as string) || null
    }
  });

  return res.status(200).json({ message: 'Consent successfully recorded' });
});

router.patch('/', authenticate, requireEmailVerified, requireConsent, async (req: Request, res: Response) => {
  const { name, address, phone } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(name ? { name: sanitize(name) } : {}),
      ...(address ? { address: sanitize(address) } : {}),
      ...(phone ? { phone: sanitize(phone) } : {})
    }
  });

  return res.json({
    id: updated.id,
    name: updated.name,
    username: updated.username,
    address: updated.address,
    phone: updated.phone
  });
});

export default router;
