#!/usr/bin/env node
/**
 * Read-Only Orphaned Firebase Auth Users Report
 *
 * Scans Firebase Auth users and correlates them with PostgreSQL `users` and `user_consents`.
 * Identifies accounts that were created in Firebase but never completed PostgreSQL profile
 * or mandatory Data Privacy Act consent creation.
 *
 * Rules:
 * - STRICTLY READ-ONLY: Never modifies or deletes any Firebase Auth users or database records.
 * - Masks all email addresses (e.g. j***@e***.com) to comply with data privacy policies.
 * - Never prints secrets, private keys, or credentials.
 *
 * Usage:
 *   node tools/report-orphaned-firebase-users.mjs
 */

import { createRequire } from 'node:module';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const admin = require('../backend/node_modules/firebase-admin');

// Parse flags: allow explicit database target (test or production)
const isTestDb = process.argv.includes('--test') || process.argv.includes('--test-db') || process.env.NODE_ENV === 'test';
const dbUrl = isTestDb
  ? (process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aqualicious_test?schema=public')
  : (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aqualicious_pg?schema=public');

const dbNameMatch = dbUrl.match(/\/([^/?#]+)(?:\?|$)/);
const targetDbName = dbNameMatch ? dbNameMatch[1] : 'unknown_db';

const saCandidates = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.resolve(process.cwd(), 'service-account.json'),
  path.resolve(process.cwd(), 'backend/service-account.json'),
  path.resolve(__dirname, '../service-account.json'),
  path.resolve(__dirname, '../backend/service-account.json')
].filter(Boolean);

let serviceAccountCredential = undefined;
for (const p of saCandidates) {
  if (fs.existsSync(p)) {
    try {
      const sa = JSON.parse(fs.readFileSync(p, 'utf8'));
      serviceAccountCredential = admin.credential.cert(sa);
      break;
    } catch {}
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } }
});

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[no-email]';
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return '[invalid-email]';
  const [local, domain] = parts;
  const maskedLocal = local.length <= 2
    ? `${local[0]}*`
    : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}`;
  const domainParts = domain.split('.');
  const domainName = domainParts[0] || '';
  const domainExt = domainParts.slice(1).join('.');
  const maskedDomain = domainName.length <= 2
    ? `${domainName[0]}*`
    : `${domainName[0]}${'*'.repeat(Math.min(domainName.length - 2, 3))}${domainName[domainName.length - 1]}`;
  return `${maskedLocal}@${maskedDomain}.${domainExt}`;
}

async function reportOrphanedUsers() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'aqualicious-723f9';
  const isEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  console.log('='.repeat(80));
  console.log('AquaLicious - Firebase Auth & PostgreSQL User Reconciliation Report (Read-Only)');
  console.log('='.repeat(80));
  console.log(`Timestamp:        ${new Date().toISOString()}`);
  console.log(`Firebase Project: ${projectId} (${isEmulator ? 'EMULATOR @ ' + process.env.FIREBASE_AUTH_EMULATOR_HOST : 'REAL/LIVE CLOUD'})`);
  console.log(`Target Database:  ${targetDbName} (${isTestDb ? 'TEST DATABASE' : 'PRODUCTION/LIVE DATABASE - READ-ONLY'})`);
  console.log('--------------------------------------------------------------------------------\n');

  if (admin.apps.length === 0) {
    admin.initializeApp({
      ...(serviceAccountCredential ? { credential: serviceAccountCredential } : {}),
      projectId
    });
  }

  const auth = admin.auth();
  let pageToken = undefined;
  const allFirebaseUsers = [];

  do {
    const listResult = await auth.listUsers(1000, pageToken);
    allFirebaseUsers.push(...listResult.users);
    pageToken = listResult.pageToken;
  } while (pageToken);

  console.log(`Total Firebase Auth users scanned: ${allFirebaseUsers.length}`);

  // Fetch all database users and consents from the target database
  const [dbUsers, dbConsents] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        firebaseUid: true,
        emailVerified: true,
        createdAt: true
      }
    }),
    prisma.userConsent.findMany({
      where: { consent: true },
      select: { userId: true, termsVersion: true, acceptedAt: true }
    })
  ]);

  console.log(`Total PostgreSQL users in [${targetDbName}]: ${dbUsers.length}`);

  const dbUserByUid = new Map();
  const dbUserByEmail = new Map();
  for (const u of dbUsers) {
    if (u.firebaseUid) dbUserByUid.set(u.firebaseUid, u);
    if (u.email) dbUserByEmail.set(u.email.toLowerCase(), u);
  }

  const userIdsWithConsent = new Set(dbConsents.map((c) => c.userId));
  const adminEmail = (process.env.ADMIN_EMAIL || 'aqualiciousadmin@gmail.com').toLowerCase();

  const reportRows = [];
  let orphanedCount = 0;
  let missingConsentCount = 0;
  let unverifiedCount = 0;
  let okCount = 0;

  // Breakdown classifications for orphans
  let testAccountOrphans = 0;
  let failedRegistrationOrphans = 0;
  let neverSignedInCount = 0;
  let hasSignedInCount = 0;

  const dateBuckets = new Map();

  for (const fbUser of allFirebaseUsers) {
    const emailLower = (fbUser.email || '').toLowerCase();
    const createdStr = fbUser.metadata?.creationTime ? new Date(fbUser.metadata.creationTime).toISOString().slice(0, 10) : 'UNKNOWN';
    const lastSignIn = fbUser.metadata?.lastSignInTime ? new Date(fbUser.metadata.lastSignInTime).toISOString().slice(0, 10) : null;
    const hasSignedIn = Boolean(lastSignIn && lastSignIn !== createdStr);

    const matchedDbUser = dbUserByUid.get(fbUser.uid) || dbUserByEmail.get(emailLower) || null;
    const isAdmin =
      emailLower === adminEmail ||
      matchedDbUser?.role === 'ADMIN' ||
      fbUser.uid === '4yR7XvIR7JaTQrifpnUtkSgTtcj1' ||
      fbUser.uid === 'UCzqYvdMqPdDeiZtzGH12ShaG0M2';

    const hasConsent = matchedDbUser ? userIdsWithConsent.has(matchedDbUser.id) : false;

    let status = 'OK';
    let orphanCategory = 'N/A';

    if (!matchedDbUser) {
      status = 'NO_DB_RECORD';
      orphanedCount++;

      if (hasSignedIn) {
        hasSignedInCount++;
      } else {
        neverSignedInCount++;
      }

      const isExampleOrTestDomain = emailLower.endsWith('@example.com') ||
        emailLower.startsWith('test') ||
        emailLower.startsWith('cust-') ||
        emailLower.startsWith('qr-');

      if (isExampleOrTestDomain) {
        testAccountOrphans++;
        orphanCategory = 'HISTORICAL_TEST_HARNESS_ACCOUNT';
      } else {
        failedRegistrationOrphans++;
        orphanCategory = 'FAILED_REGISTRATION_ATTEMPT';
      }

      // Date bucket aggregation
      const monthBucket = createdStr.slice(0, 7);
      dateBuckets.set(monthBucket, (dateBuckets.get(monthBucket) || 0) + 1);
    } else if (!hasConsent && !isAdmin) {
      status = 'NO_CONSENT';
      missingConsentCount++;
    } else if (!fbUser.emailVerified && !isAdmin) {
      status = 'UNVERIFIED';
      unverifiedCount++;
    } else {
      okCount++;
    }

    reportRows.push({
      uid: fbUser.uid,
      maskedEmail: maskEmail(fbUser.email),
      role: isAdmin ? 'ADMIN' : (matchedDbUser?.role || 'NONE'),
      emailVerified: fbUser.emailVerified ? 'YES' : 'NO',
      dbUserId: matchedDbUser ? String(matchedDbUser.id) : 'NONE',
      hasConsent: hasConsent ? 'YES' : (isAdmin ? 'N/A (Admin)' : 'NO'),
      createdAt: createdStr,
      lastSignIn: lastSignIn || 'NEVER',
      status,
      orphanCategory
    });
  }

  // Print results summary
  console.log('\nReconciliation Status Breakdown:');
  console.log(`  Healthy / Active:      ${okCount}`);
  console.log(`  Orphaned (No DB Row):  ${orphanedCount}`);
  console.log(`  Missing DPA Consent:   ${missingConsentCount}`);
  console.log(`  Unverified Email:      ${unverifiedCount}`);

  if (orphanedCount > 0) {
    console.log('\nOrphan Classification Analysis:');
    console.log(`  - Historical Test Suite Accounts (@example.com / test-* / cust-*): ${testAccountOrphans}`);
    console.log(`  - Failed Real Registration Attempts (Aborted before DB commit):   ${failedRegistrationOrphans}`);
    console.log(`  - Never Signed In (Account created in Firebase, never used):       ${neverSignedInCount}`);
    console.log(`  - Has Signed In at least once:                                     ${hasSignedInCount}`);

    console.log('\nOrphans by Creation Month:');
    for (const [month, count] of Array.from(dateBuckets.entries()).sort()) {
      console.log(`  - ${month}: ${count} accounts`);
    }
  }

  console.log('\nSample Detailed Report (first 25 rows):');
  console.table(
    reportRows.slice(0, 25).map((r) => ({
      'Firebase UID': r.uid,
      'Email (Masked)': r.maskedEmail,
      Role: r.role,
      Verified: r.emailVerified,
      'DB ID': r.dbUserId,
      Created: r.createdAt,
      'Last Sign-in': r.lastSignIn,
      Status: r.status,
      Classification: r.orphanCategory
    }))
  );

  console.log('\n[SAFEGUARD] Report completed in read-only mode.');
  console.log('[SAFEGUARD] Zero records were altered or deleted. No deletion scripts are proposed.');
}

try {
  await reportOrphanedUsers();
} catch (err) {
  console.error('[report-orphaned-firebase-users] Error:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
