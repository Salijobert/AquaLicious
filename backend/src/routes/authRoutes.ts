import { Router, Request, Response } from 'express';
import { prisma, config, generateTestToken } from '../config/index.js';
import { authenticate, requireEmailVerified, requireConsent } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { sanitize, apiLimiter } from '../middleware/security.js';
import { Mailer } from '../services/mailer.js';
import admin from 'firebase-admin';
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
    let verificationLink = `${config.frontendUrl}/verify-email-complete?mode=verifyEmail&email=${encodeURIComponent(user.email)}&oobCode=code-${Date.now()}`;
    try {
      if (admin.apps.length > 0) {
        verificationLink = await admin.auth().generateEmailVerificationLink(user.email, {
          url: `${config.frontendUrl}/verify-email-complete`
        });
      }
    } catch (fbErr: any) {
      console.warn('[Auth] Verification link fallback:', fbErr.message);
    }

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
      let resetLink = `${config.frontendUrl}/reset-password-complete?mode=resetPassword&oobCode=code-${Date.now()}`;
      try {
        if (admin.apps.length > 0) {
          resetLink = await admin.auth().generatePasswordResetLink(user.email, {
            url: `${config.frontendUrl}/reset-password-complete`
          });
        }
      } catch (err: any) {
        console.warn('[Auth] Password reset link fallback:', err.message);
      }

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
  if (config.nodeEnv === 'production' || process.env.ALLOW_LOCAL_AUTH_FALLBACK !== 'true') {
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
    let resetLink = `${config.frontendUrl}/reset-password-complete?mode=resetPassword&oobCode=code-${Date.now()}`;
    try {
      if (admin.apps.length > 0) {
        resetLink = await admin.auth().generatePasswordResetLink(user.email, {
          url: `${config.frontendUrl}/reset-password-complete`
        });
      }
    } catch (err: any) {
      console.warn('[Auth] Password reset link fallback:', err.message);
    }

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
    let verificationLink = `${config.frontendUrl}/verify-email-complete?mode=verifyEmail&email=${encodeURIComponent(user.email)}&oobCode=code-${Date.now()}`;
    try {
      if (admin.apps.length > 0) {
        let fbUser: admin.auth.UserRecord;
        try {
          fbUser = await admin.auth().getUserByEmail(user.email);
        } catch (notFound) {
          fbUser = await admin.auth().createUser({
            email: user.email,
            displayName: user.name,
            emailVerified: false
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid: fbUser.uid }
          });
        }
        verificationLink = await admin.auth().generateEmailVerificationLink(user.email, {
          url: `${config.frontendUrl}/verify-email-complete`
        });
      }
    } catch (err: any) {
      console.warn('[Auth] Resend verification link fallback:', err.message);
    }

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
