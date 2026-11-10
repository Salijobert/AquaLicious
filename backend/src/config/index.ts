import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or project root
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(process.cwd(), '.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
if (!process.env.PORT) {
  dotenv.config();
}

const isProduction = process.env.NODE_ENV === 'production';

const rawAdminUids = process.env.ADMIN_FIREBASE_UIDS || process.env.ADMIN_FIREBASE_UID || '';
const parsedAdminUids = rawAdminUids
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

// In production, the server MUST refuse to start if JWT_SECRET is missing or weak (< 32 characters), or if at least one ADMIN_FIREBASE_UID(S) is missing
if (isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: In production, JWT_SECRET environment variable is required and must be at least 32 characters long. Server refusing to start.'
    );
  }
  if (parsedAdminUids.length === 0) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: In production, ADMIN_FIREBASE_UIDS (or ADMIN_FIREBASE_UID) environment variable is required with at least one authorized UID. Server refusing to start.'
    );
  }
}

export const config = {
  port: parseInt(process.env.PORT || '8088', 10),
  failoverPort: parseInt(process.env.FAILOVER_PORT || '8089', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  adminFirebaseUids: parsedAdminUids,
  adminFirebaseUid: parsedAdminUids[0] || '',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8088,http://localhost:8090,https://localhost,capacitor://localhost,https://aqualicious.vercel.app,https://muscular-donator-uncloak.ngrok-free.dev')
    .split(',')
    .map(o => o.trim()),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9',
  gcashQrUrl: process.env.GCASH_QR_URL || '',
  mayaQrUrl: process.env.MAYA_QR_URL || '',
  timezone: process.env.TIMEZONE || 'Asia/Manila',
  clusterId: process.env.CLUSTER_ID || 'aqualicious-cluster-primary',
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'aqualicious-dev-jwt-signing-secret-for-offline-testing-1234567890'),
  adminEmail: process.env.ADMIN_EMAIL || 'aqualiciousadmin@gmail.com',
  mailFromName: process.env.MAIL_FROM_NAME || 'AquaLicious',
  smtpUser: process.env.SMTP_USER || 'aqualiciousadmin@gmail.com',
  smtpPass: process.env.SMTP_PASS || '',
  frontendUrl: (process.env.FRONTEND_URL || 'https://aqualicious.vercel.app').replace(/\/$/, ''),
  // Default to true (safe dry-run) when CLEANUP_DRY_RUN is unset, even in production
  cleanupDryRun: process.env.CLEANUP_DRY_RUN !== undefined
    ? process.env.CLEANUP_DRY_RUN === 'true'
    : true
};

// Singleton Prisma Client
export const prisma = new PrismaClient();

// Firebase Admin Initialization
let firebaseApp: admin.app.App | null = null;
try {
  if (admin.apps.length === 0) {
    let credential: admin.credential.Credential | undefined;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        credential = admin.credential.cert(serviceAccount);
      } catch (e) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON string');
      }
    } else {
      const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.resolve(process.cwd(), 'service-account.json'),
        path.resolve(process.cwd(), 'backend/service-account.json'),
        path.resolve(__dirname, '../../service-account.json'),
        path.resolve(__dirname, '../service-account.json')
      ].filter(Boolean) as string[];

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const raw = fs.readFileSync(p, 'utf8');
            const sa = JSON.parse(raw);
            credential = admin.credential.cert(sa);
            if (sa.project_id && !process.env.FIREBASE_PROJECT_ID) {
              config.firebaseProjectId = sa.project_id;
            }
            break;
          } catch (e) {
            // continue
          }
        }
      }
    }

    if (credential) {
      firebaseApp = admin.initializeApp({
        credential,
        projectId: config.firebaseProjectId
      });
      console.log(`Firebase Admin SDK initialized with credentials for project: ${config.firebaseProjectId}`);
    } else {
      firebaseApp = admin.initializeApp({
        projectId: config.firebaseProjectId
      });
    }
  } else {
    firebaseApp = admin.apps[0]!;
  }
} catch (err: any) {
  console.warn('Firebase Admin initialized in local development/fallback mode:', err.message);
}

export { firebaseApp };

export interface TokenClaims {
  uid: string;
  email?: string;
  role?: string;
  name?: string;
  [key: string]: any;
}

/**
 * Verifies a Firebase ID token.
 * In production, validates strictly against Google Firebase Auth.
 * Test-auth HMAC verification is completely disabled in production.
 */
export async function verifyToken(idToken: string): Promise<TokenClaims> {
  if (!idToken) {
    throw new Error('No token provided');
  }

  // 1. Try Firebase Admin native verification if configured
  try {
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    return {
      name: decoded.name || '',
      ...decoded,
      uid: decoded.uid,
      email: decoded.email
    };
  } catch (fbErr: any) {
    // When local fallback is not explicitly enabled, fail immediately: NO test token fallback
    if (process.env.ALLOW_LOCAL_AUTH_FALLBACK !== 'true') {
      throw new Error(fbErr.message || 'Invalid or expired Firebase ID token');
    }

    // 2. ONLY for local development / test environments when explicitly allowed
    try {
      const decoded = jwt.verify(idToken, config.jwtSecret) as TokenClaims;
      if (decoded && decoded.uid) {
        return {
          name: decoded.name || '',
          ...decoded,
          uid: decoded.uid,
          email: decoded.email
        };
      }
    } catch {
      throw new Error(fbErr.message || 'Invalid authentication token');
    }
    throw new Error(fbErr.message || 'Invalid Firebase ID token');
  }
}

/**
 * Creates a test Firebase-compatible ID token ONLY for automated test environments.
 * Strictly throws if called in production or without ALLOW_LOCAL_AUTH_FALLBACK=true.
 */
export function generateTestToken(claims: TokenClaims): string {
  if (process.env.ALLOW_LOCAL_AUTH_FALLBACK !== 'true') {
    throw new Error('FATAL: generateTestToken is strictly disabled unless ALLOW_LOCAL_AUTH_FALLBACK=true');
  }
  return jwt.sign(
    {
      iss: `https://securetoken.google.com/${config.firebaseProjectId}`,
      aud: config.firebaseProjectId,
      auth_time: Math.floor(Date.now() / 1000),
      sub: claims.uid,
      ...claims
    },
    config.jwtSecret,
    { expiresIn: '2h' }
  );
}
