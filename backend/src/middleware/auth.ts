import { Request, Response, NextFunction } from 'express';
import { prisma, verifyToken } from '../config/index.js';
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
    
    // Look up user profile in PostgreSQL
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { firebaseUid: claims.uid },
          ...(claims.email ? [{ email: claims.email }] : [])
        ]
      }
    });

    if (!user) {
      // First sign-in for customer: auto-provision CUSTOMER role ONLY.
      // Admin and Staff roles MUST be provisioned by trusted backend operations.
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
          active: true
        }
      });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'User account is deactivated' });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Invalid or expired authentication token' });
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
      where: {
        OR: [
          { firebaseUid: claims.uid },
          ...(claims.email ? [{ email: claims.email }] : [])
        ]
      }
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
      where: {
        OR: [
          { firebaseUid: claims.uid },
          ...(claims.email ? [{ email: claims.email }] : [])
        ]
      }
    });

    if (user && user.active && user.role === Role.ADMIN) {
      adminUser = user;
    }
  } catch {
    // If not a token, check if it's an admin user's UID or ID if running under trusted session
  }

  if (!adminUser) {
    throw new Error('Invalid or unauthorized administrator credentials');
  }

  return adminUser;
}
