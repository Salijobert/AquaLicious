import { Router, Request, Response } from 'express';
import { prisma, config, verifyToken } from '../config/index.js';
import { authenticate, requireEmailVerified, requireConsent } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { sanitize, apiLimiter } from '../middleware/security.js';
import { Mailer } from '../services/mailer.js';
import admin from 'firebase-admin';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { assertAllowedName } from '../utils/nameFilter.js';
import { buildFirebaseVerificationLink } from '../utils/verificationLink.js';

const router = Router();

const resendIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many verification email requests from this IP. Please try again later.' }
});

const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many password reset requests from this IP. Please try again later.' }
});

const resolveIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 1000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many login attempts from this IP. Please try again later.' }
});

// Enumeration-safe in-memory per-email cooldown shared across known & unknown addresses
const forgotPasswordEmailCooldown = new Map<string, number>();
const FORGOT_PASSWORD_COOLDOWN_MS = 60_000;

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

async function buildFirebasePasswordResetLink(email: string, name?: string, emailVerified?: boolean): Promise<string | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (admin.apps.length === 0) {
    return null;
  }

  try {
    try {
      await admin.auth().getUserByEmail(cleanEmail);
    } catch (notFoundErr: any) {
      if (notFoundErr?.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          email: cleanEmail,
          ...(name ? { displayName: name } : {}),
          emailVerified: Boolean(emailVerified)
        });
      }
    }

    const rawLink = await admin.auth().generatePasswordResetLink(cleanEmail, {
      url: `${config.frontendUrl}/reset-password-complete`
    });

    const parsed = new URL(rawLink);
    const oobCode = parsed.searchParams.get('oobCode') || '';
    if (!oobCode) {
      return null;
    }

    const query = new URLSearchParams({
      mode: 'resetPassword',
      oobCode
    });

    return `${config.frontendUrl}/reset-password-complete?${query.toString()}`;
  } catch (err: any) {
    console.warn('[Auth] Firebase generatePasswordResetLink warning:', err.message);
    return null;
  }
}

async function handleForgotPasswordRequest(rawEmail: string): Promise<{ status: number; body: Record<string, any> }> {
  const cleanEmail = sanitize(rawEmail).trim().toLowerCase();
  const start = Date.now();
  const now = start;

  const lastRequested = forgotPasswordEmailCooldown.get(cleanEmail) || 0;
  const inCooldown = now - lastRequested < FORGOT_PASSWORD_COOLDOWN_MS;
  if (!inCooldown) {
    forgotPasswordEmailCooldown.set(cleanEmail, now);

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: cleanEmail, mode: 'insensitive' }
      }
    });

    if (user && user.active) {
      const recentCheck = await Mailer.hasRecentPasswordResetEmail(user.email, FORGOT_PASSWORD_COOLDOWN_MS);
      if (!recentCheck.recent) {
        const resetLink = await buildFirebasePasswordResetLink(user.email, user.name, user.emailVerified);
        if (resetLink) {
          Mailer.sendPasswordResetEmail(user.email, user.name, resetLink, user.id).catch((err) => {
            console.error('[Auth] Password reset email failure:', err);
          });
        }
      }
    }
  }

  // Consistent response timing to prevent timing attacks / user enumeration
  const elapsed = Date.now() - start;
  if (elapsed < 120) {
    await new Promise((resolve) => setTimeout(resolve, 120 - elapsed));
  }

  return {
    status: 200,
    body: {
      message: 'If an account exists with that email, a password reset link has been sent.'
    }
  };
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

    try {
      assertAllowedName(validData.name);
      assertAllowedName(validData.username);
    } catch (filterErr: any) {
      return res.status(filterErr.status || 422).json({ error: filterErr.message || 'Please choose a different name.' });
    }

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
    let tokenType: 'firebase_custom' | 'none' = 'none';
    if (admin.apps.length > 0) {
      try {
        token = await admin.auth().createCustomToken(user.firebaseUid, {
          role: 'CUSTOMER',
          email_verified: false
        });
        tokenType = 'firebase_custom';
      } catch (e: any) {
        console.warn('[Auth] Custom token creation warning:', e.message);
      }
    }

    return res.status(200).json({
      token,
      tokenType,
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
    const parseResult = forgotPasswordSchema.safeParse({ email: req.body?.email });
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Valid email is required' });
    }
    return forgotPasswordIpLimiter(req, res, async () => {
      const outcome = await handleForgotPasswordRequest(parseResult.data.email);
      return res.status(outcome.status).json(outcome.body);
    });
  }

  // 1d. Resolve username or email to email address for Firebase login
  if (action === 'resolve_identifier') {
    return resolveIpLimiter(req, res, async () => {
      const { identifier } = req.body;
      if (!identifier || typeof identifier !== 'string') {
        return res.status(422).json({ error: 'Identifier is required' });
      }
      const cleanId = sanitize(identifier).trim();

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
    });
  }

  // 2. Direct ID Token verification (from Firebase Web SDK)
  if (idToken && typeof idToken === 'string') {
    try {
      const claims = await verifyToken(idToken);
      const user = await prisma.user.findFirst({
        where: { firebaseUid: claims.uid }
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
          email: user.email,
          email_verified: Boolean(user.emailVerified),
          role: user.role === Role.ADMIN ? 'Administrator' : 'Customer'
        } : null
      });
    } catch {
      return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_TOKEN_INVALID' });
    }
  }

  // 3. Reject direct password logins (Firebase authentication is required)
  if (!username) {
    return res.status(422).json({ error: 'Username is required' });
  }

  if (!password) {
    return res.status(422).json({ error: 'Password is required' });
  }

  return res.status(403).json({
    error: 'Direct local authentication is disabled in production. Use Firebase authentication.',
    code: 'LOCAL_AUTH_DISABLED'
  });
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required')
}).strict();

const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required')
}).strict();

router.post('/forgot-password', apiLimiter, forgotPasswordIpLimiter, async (req: Request, res: Response) => {
  const parseResult = forgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(422).json({ error: 'Valid email is required' });
  }

  const outcome = await handleForgotPasswordRequest(parseResult.data.email);
  return res.status(outcome.status).json(outcome.body);
});

router.post('/resend-verification', apiLimiter, resendIpLimiter, async (req: Request, res: Response) => {
  const parseResult = resendVerificationSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(422).json({ error: 'Valid email is required' });
  }

  const { email } = parseResult.data;
  const start = Date.now();

  const recentCheck = await Mailer.hasRecentVerificationEmail(email, 60_000);
  if (recentCheck.recent) {
    return res.status(429).json({
      error: `Please wait ${recentCheck.retryAfterSeconds} second(s) before requesting another verification email.`,
      retryAfterSeconds: recentCheck.retryAfterSeconds
    });
  }

  const user = await prisma.user.findFirst({ where: { email } });

  if (user && !user.emailVerified) {
    const verificationLink = await buildFirebaseVerificationLink(user.email, user.name);
    await Mailer.sendVerificationEmail(user.email, user.name, verificationLink, user.id).catch((err) => {
      console.error('[Auth] Resend verification email failure:', err);
    });
  }

  const elapsed = Date.now() - start;
  if (elapsed < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100 - elapsed));
  }

  return res.status(200).json({
    message: 'If an unverified account exists with that email, a verification link has been sent.',
    sentAt: new Date().toISOString()
  });
});

router.get('/verification-status', async (req: Request, res: Response) => {
  const email = (req.query.email as string)?.trim().toLowerCase();
  if (!email) {
    return res.status(422).json({ error: 'Email parameter required' });
  }

  // Verification status is derived strictly from Firebase (read-only; DB sync happens in authenticate middleware)
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

  return res.json({ verified: firebaseVerified });
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
