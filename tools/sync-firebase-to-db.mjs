#!/usr/bin/env node
/**
 * Sync Firebase Auth Users to Local PostgreSQL Database
 * 
 * Fetches all registered users from Google Firebase Authentication and inserts
 * or updates their matching profiles in the local PostgreSQL database.
 * 
 * Usage:
 *   node tools/sync-firebase-to-db.mjs
 */

import { createRequire } from 'node:module';
import { prisma, config } from '../backend/dist/config/index.js';

const require = createRequire(import.meta.url);
const admin = require('../backend/node_modules/firebase-admin');
const { Role } = require('../backend/node_modules/@prisma/client');

async function syncFirebaseUsers() {
  console.log('=== AQUALICIOUS FIREBASE TO POSTGRESQL SYNC ===\n');

  if (admin.apps.length === 0) {
    console.error('[FAIL] Firebase Admin SDK is not initialized. Ensure backend/service-account.json exists.');
    process.exit(1);
  }

  const auth = admin.auth();
  let nextPageToken;
  let totalProcessed = 0;
  let createdCount = 0;
  let updatedCount = 0;

  try {
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      nextPageToken = listUsersResult.pageToken;

      for (const fbUser of listUsersResult.users) {
        totalProcessed++;
        const email = (fbUser.email || '').trim().toLowerCase();
        if (!email) {
          console.log(`[SKIP] UID ${fbUser.uid} has no email.`);
          continue;
        }

        const displayName = fbUser.displayName || email.split('@')[0] || 'Customer';
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || `user_${totalProcessed}`;

        // Check if this user is in the configured admin UIDs list
        const isAdmin = config.adminFirebaseUids.includes(fbUser.uid) || email === config.adminEmail?.toLowerCase();
        const role = isAdmin ? Role.ADMIN : Role.CUSTOMER;

        // Check if user already exists by firebaseUid or email
        const existing = await prisma.user.findFirst({
          where: {
            OR: [
              { firebaseUid: fbUser.uid },
              { email }
            ]
          }
        });

        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              firebaseUid: fbUser.uid,
              email,
              name: existing.name || displayName,
              active: !fbUser.disabled,
              emailVerified: fbUser.emailVerified
            }
          });
          updatedCount++;
          console.log(`[UPDATED] ${email} (Role: ${existing.role}, Active: ${!fbUser.disabled})`);
        } else {
          // Generate a unique username if base is taken
          let candidateUsername = baseUsername;
          let counter = 1;
          while (await prisma.user.findUnique({ where: { username: candidateUsername } })) {
            candidateUsername = `${baseUsername}_${counter++}`;
          }

          const newUser = await prisma.user.create({
            data: {
              firebaseUid: fbUser.uid,
              email,
              username: candidateUsername,
              name: displayName,
              role,
              emailVerified: fbUser.emailVerified,
              active: !fbUser.disabled
            }
          });

          // Also create initial consent so they can browse without consent block
          await prisma.userConsent.create({
            data: {
              userId: newUser.id,
              consent: true,
              termsVersion: '2.0.0'
            }
          }).catch(() => {});

          createdCount++;
          console.log(`[CREATED] ${email} as @${candidateUsername} (Role: ${role}, Active: ${!fbUser.disabled})`);
        }
      }
    } while (nextPageToken);

    console.log('\n=== SYNC COMPLETE ===');
    console.log(`Total Firebase Users Processed: ${totalProcessed}`);
    console.log(`Created in PostgreSQL: ${createdCount}`);
    console.log(`Updated in PostgreSQL: ${updatedCount}`);
  } catch (err) {
    console.error('[ERROR] Sync failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncFirebaseUsers();
