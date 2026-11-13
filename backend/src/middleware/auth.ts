import { Request, Response, NextFunction } from 'express';
import { prisma, verifyToken, config } from '../config/index.js';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  firebaseUid: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  role: Role;
  emailVerified: boolean;
  active: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clusterId?: string;
    }
  }
}

/**
 * Validates Firebase ID token and loads application profile from PostgreSQL.
 * If user profile does not exist, registers them with CUSTOMER role only.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split('Bearer ')[1]!.trim();
  try {
    const claims = await verifyToken(token);
    const isTokenVerified = Boolean(claims.email_verified || claims.emailVerified);
    
    // 1. Look up user profile strictly by firebaseUid first
    let user = await prisma.user.findFirst({
      where: { firebaseUid: claims.uid }
    });

    // 2. If not found by firebaseUid, only link an existing user by email if token is VERIFIED
    if (!user && claims.email) {
      const cleanEmail = claims.email.trim().toLowerCase();
      const existingUser = await prisma.user.findFirst({
        where: { email: cleanEmail }
      });

      if (existingUser) {
        // Enforce: unverified Firebase token must NEVER link to an existing account
        if (!isTokenVerified) {
          return res.status(403).json({
            error: 'Email verification required in Firebase before linking to existing profile',
            code: 'EMAIL_VERIFICATION_REQUIRED_FOR_LINK'
          });
        }

        // An unverified or unauthorized Firebase identity must never get the admin profile
        if (existingUser.role === Role.ADMIN) {
          const authorizedUids = config.adminFirebaseUids;
          const isAuthorized =
            authorizedUids.length === 0 ||
            authorizedUids.includes(claims.uid) ||
            (config.nodeEnv !== 'production' && claims.uid.startsWith('local-'));

          if (!isAuthorized) {
            return res.status(403).json({
              error: 'Unauthorized Firebase identity for Administrator account',
              code: 'FIREBASE_UID_MISMATCH'
            });
          }
        }

        // Check if existing user is already permanently linked to a different real Firebase UID
        const isPlaceholderUid = existingUser.firebaseUid.startsWith('uid-') || 
                                 existingUser.firebaseUid.startsWith('qa-') ||
                                 existingUser.firebaseUid.startsWith('local-') ||
                                 existingUser.firebaseUid.startsWith('demo-');
        if (!isPlaceholderUid && existingUser.firebaseUid !== claims.uid) {
          return res.status(403).json({
            error: 'Account is already linked to a different Firebase identity',
            code: 'FIREBASE_UID_MISMATCH'
          });
        }

        // First link: update database record with verified firebaseUid
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            firebaseUid: claims.uid,
            emailVerified: true
          }
        });
      }
    }

    if (!user) {
      // First sign-in for customer: auto-provision CUSTOMER role ONLY.
      // Administrator role MUST be provisioned by trusted backend operations.
      const defaultUsername = claims.email 
        ? claims.email.split('@')[0]! + '-' + claims.uid.slice(-4)
        : 'user-' + claims.uid.slice(-6);

      user = await prisma.user.create({
        data: {
          firebaseUid: claims.uid,
          name: claims.name || claims.email?.split('@')[0] || 'Customer',
          username: defaultUsername,
          email: claims.email || `${claims.uid}@aqualicious.local`,
          role: Role.CUSTOMER,
          emailVerified: isTokenVerified,
          active: true
        }
      });
    }

    // Admin profile check: if user is Admin, verify UID matches authorized admin UIDs
    if (user.role === Role.ADMIN) {
      const authorizedUids = config.adminFirebaseUids;
      const isAuthorized =
        authorizedUids.length === 0 ||
        authorizedUids.includes(user.firebaseUid) ||
        (config.nodeEnv === 'test' &&
          process.env.ALLOW_LOCAL_AUTH_FALLBACK === 'true' &&
          (user.firebaseUid.startsWith('local-') || user.firebaseUid === 'uid-admin'));

      if (!isAuthorized) {
        return res.status(403).json({
          error: 'Administrator account requires authorized Firebase UID',
          code: 'FIREBASE_UID_MISMATCH'
        });
      }
    }

    // Sync token email verification with database if claims indicate verified
    if (isTokenVerified && !user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true }
      });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'User account is deactivated' });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({
      error: err.message || 'Invalid or expired authentication token',
      code: err?.code || 'AUTH_TOKEN_INVALID'
    });
  }
}

/**
 * Optional authentication middleware for endpoints like product catalog.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1]!.trim();
  try {
    const claims = await verifyToken(token);
    const user = await prisma.user.findFirst({
      where: { firebaseUid: claims.uid }
    });

    if (user && user.active) {
      req.user = user;
    }
  } catch {
    // Ignore invalid tokens in optional auth
  }

  next();
}

/**
 * Guard middleware enforcing specific roles.
 */
export function requireRole(allowed: Role | Role[]) {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires role ${roles.join(' or ')}` });
    }

    next();
  };
}

/**
 * Guard middleware enforcing email verification for customers.
 * Administrators are exempt.
 */
export function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin role is exempt
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required before accessing this service.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
}

/**
 * Guard middleware enforcing Data Privacy Act consent (RA 10173).
 * Customer actions require an active UserConsent record with consent=true.
 * Administrators are exempt.
 */
export async function requireConsent(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Administrators are exempt from customer privacy terms
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  const consentRecord = await prisma.userConsent.findFirst({
    where: {
      userId: req.user.id,
      consent: true
    },
    orderBy: { acceptedAt: 'desc' }
  });

  if (!consentRecord) {
    return res.status(403).json({
      error: 'Data Privacy Act consent is required before performing customer actions.',
      code: 'CONSENT_REQUIRED'
    });
  }

  next();
}

/**
 * Server-verified administrator authorization for void approvals.
 * Adapts to Firebase reauthentication: accepts either current admin user or an admin reauth token.
 */
export async function verifyAdminApproval(adminTokenOrUid: string): Promise<AuthUser> {
  if (!adminTokenOrUid) {
    throw new Error('Administrator approval token required for void');
  }

  let adminUser: AuthUser | null = null;
  try {
    const claims = await verifyToken(adminTokenOrUid);
    const user = await prisma.user.findFirst({
      where: { firebaseUid: claims.uid }
    });

    if (user && user.active && user.role === Role.ADMIN) {
      const expectedAdminUid = process.env.ADMIN_FIREBASE_UID;
      if (!expectedAdminUid || user.firebaseUid === expectedAdminUid) {
        adminUser = user;
      }
    }
  } catch {
    // If not a token, check if it's an admin user's UID or ID if running under trusted session
  }

  if (!adminUser) {
    throw new Error('Invalid or unauthorized administrator credentials');
  }

  return adminUser;
}
