/**
 * Read-Only Production User Reconciliation Tool
 * 
 * Verifies that all users with emailVerified=true in PostgreSQL have matching
 * genuine verified identities in Google Firebase Auth.
 * 
 * Usage:
 *   node tools/production-reconcile-users.mjs
 * 
 * Required Environment Variables:
 *   DATABASE_URL
 *   FIREBASE_SERVICE_ACCOUNT_KEY (or GOOGLE_APPLICATION_CREDENTIALS)
 *   FIREBASE_PROJECT_ID
 */

import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import admin from '../backend/node_modules/firebase-admin/lib/index.js';

const prisma = new PrismaClient();

// Initialize Firebase Admin (respecting service account or emulator)
if (admin.apps.length === 0) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(sa);
    } catch {
      console.warn('Notice: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY JSON string');
    }
  }

  admin.initializeApp({
    credential: credential || admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9'
  });
}

async function reconcileUsers() {
  console.log('=== AQUALICIOUS READ-ONLY PRODUCTION USER RECONCILIATION ===');
  console.log(`Database: Connected via Prisma`);
  console.log(`Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9'}\n`);

  const verifiedDbUsers = await prisma.user.findMany({
    where: { emailVerified: true },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      firebaseUid: true,
      emailVerified: true,
      verificationDeadline: true,
      createdAt: true
    },
    orderBy: { id: 'asc' }
  });

  console.log(`Found ${verifiedDbUsers.length} verified user records in PostgreSQL.\n`);

  let matchedCount = 0;
  const mismatches = [];
  const placeholderWarnings = [];
  const notFoundInFirebase = [];

  for (const user of verifiedDbUsers) {
    const isPlaceholder =
      user.firebaseUid.startsWith('uid-') ||
      user.firebaseUid.startsWith('local-') ||
      user.firebaseUid.startsWith('qa-') ||
      user.firebaseUid.startsWith('demo-') ||
      user.firebaseUid.length !== 28;

    let fbUser = null;
    try {
      if (isPlaceholder) {
        fbUser = await admin.auth().getUserByEmail(user.email);
      } else {
        fbUser = await admin.auth().getUser(user.firebaseUid);
      }
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        notFoundInFirebase.push({
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          firebaseUid: user.firebaseUid,
          reason: 'User record does not exist in Firebase Auth'
        });
        continue;
      }
      console.error(`Error querying Firebase for user #${user.id} (${user.email}):`, err.message);
      continue;
    }

    if (isPlaceholder) {
      placeholderWarnings.push({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        dbUid: user.firebaseUid,
        realFbUid: fbUser.uid,
        fbEmailVerified: fbUser.emailVerified
      });
    }

    if (!fbUser.emailVerified) {
      mismatches.push({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        dbVerified: user.emailVerified,
        fbVerified: fbUser.emailVerified,
        firebaseUid: fbUser.uid,
        createdAt: user.createdAt
      });
    } else if (!isPlaceholder) {
      matchedCount++;
    }
  }

  console.log('--- RECONCILIATION REPORT SUMMARY ---');
  console.log(`Verified DB Users Checked:      ${verifiedDbUsers.length}`);
  console.log(`Genuinely Verified & Linked:    ${matchedCount}`);
  console.log(`Mismatched (Firebase Unverified): ${mismatches.length}`);
  console.log(`Missing in Firebase Auth:       ${notFoundInFirebase.length}`);
  console.log(`Placeholder UIDs in DB:         ${placeholderWarnings.length}`);

  if (mismatches.length > 0) {
    console.log('\n[!] CRITICAL: Users marked verified in DB but UNVERIFIED in Firebase:');
    console.table(mismatches);
  }

  if (notFoundInFirebase.length > 0) {
    console.log('\n[!] WARNING: Users marked verified in DB but NOT FOUND in Firebase Auth:');
    console.table(notFoundInFirebase);
  }

  if (placeholderWarnings.length > 0) {
    console.log('\n[*] NOTICE: Users with placeholder UIDs needing first-link migration:');
    console.table(placeholderWarnings);
  }

  if (mismatches.length === 0 && notFoundInFirebase.length === 0) {
    console.log('\n[✓] All verified users are verified in Firebase Auth.');
  }

  await prisma.$disconnect();
}

reconcileUsers().catch(err => {
  console.error('Fatal error during user reconciliation:', err);
  process.exit(1);
});
