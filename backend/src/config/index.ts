import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8088', 10),
  failoverPort: parseInt(process.env.FAILOVER_PORT || '8089', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/aqualicious_pg?schema=public',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080,http://localhost:8090,https://localhost,capacitor://localhost')
    .split(',')
    .map(o => o.trim()),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'aqualicious-pos',
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
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebaseProjectId
      });
    } else {
      firebaseApp = admin.initializeApp({
        projectId: config.firebaseProjectId
      });
    }
  } else {
    firebaseApp = admin.apps[0]!;
  }
} catch (err) {
  console.warn('Firebase Admin initialized in local development/fallback mode');
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
