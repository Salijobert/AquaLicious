import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8088', 10),
  failoverPort: parseInt(process.env.FAILOVER_PORT || '8089', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080,http://localhost:8090,https://localhost,capacitor://localhost')
    .split(',')
    .map(o => o.trim()),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9',
  gcashQrUrl: process.env.GCASH_QR_URL || '',
  mayaQrUrl: process.env.MAYA_QR_URL || '',
  timezone: process.env.TIMEZONE || 'Asia/Manila',
  clusterId: process.env.CLUSTER_ID || 'aqualicious-cluster-primary',
  jwtSecret: process.env.JWT_SECRET || 'aqualicious-dev-jwt-signing-secret-for-offline-testing-1234567890'
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
 * In production, validates against Google's Firebase Auth servers.
 * In local testing/dev environments, also accepts HMAC/RSA signed tokens matching test keys.
 */
export async function verifyToken(idToken: string): Promise<TokenClaims> {
  if (!idToken) {
    throw new Error('No token provided');
  }

  // 1. Try Firebase Admin native verification if configured
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      name: decoded.name || '',
      ...decoded,
      uid: decoded.uid,
      email: decoded.email
    };
  } catch (fbErr: any) {
    // 2. In dev/test, fallback to local test JWT verification
    if (config.nodeEnv !== 'production' || process.env.ALLOW_LOCAL_AUTH_FALLBACK === 'true') {
      try {
        const decoded = jwt.verify(idToken, config.jwtSecret) as TokenClaims;
        if (decoded && decoded.uid) {
          return decoded;
        }
      } catch (jwtErr) {
        throw new Error('Invalid authentication token');
      }
    }
    throw new Error(fbErr.message || 'Invalid Firebase ID token');
  }
}

/**
 * Creates a test Firebase-compatible ID token for automated test environments.
 */
export function generateTestToken(claims: TokenClaims): string {
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
