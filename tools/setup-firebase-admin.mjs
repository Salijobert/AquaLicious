#!/usr/bin/env node
/**
 * Links an Administrator database profile to a verified Google Firebase Auth account.
 *
 * Usage:
 *   node tools/setup-firebase-admin.mjs --email aqualiciousadmin@gmail.com [--username admin]
 *
 * Note:
 * - Reads DATABASE_URL & Firebase Admin SDK credentials from backend/.env and backend/service-account.json
 *   (via backend/dist/config/index.js). Run `npm --prefix backend run build` first if dist/ is missing.
 * - Never prints passwords, private keys, or connection strings.
 */

import { createRequire } from 'node:module';
import readline from 'node:readline';
import { prisma, config } from '../backend/dist/config/index.js';

const require = createRequire(import.meta.url);
const admin = require('../backend/node_modules/firebase-admin');
const { Role } = require('../backend/node_modules/@prisma/client');

function parseArgs(argv) {
  const args = {
    email: config.adminEmail || 'aqualiciousadmin@gmail.com',
    username: 'admin',
    name: 'Administrator',
    password: process.env.ADMIN_NEW_PASSWORD || '',
    yes: false
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--email' && next) { args.email = next.trim().toLowerCase(); i++; }
    else if (key === '--username' && next) { args.username = next.trim(); i++; }
    else if (key === '--name' && next) { args.name = next.trim(); i++; }
    else if (key === '--password' && next) { args.password = next; i++; }
    else if (key === '--yes' || key === '-y') { args.yes = true; }
  }
  return args;
}

/** Reads a line from stdin without echoing typed characters when running interactively. */
function promptHidden(promptText) {
  console.log(promptText);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = function _writeToOutput(str) {
      if (rl.stdoutMuted) {
        if (str === '\r\n' || str === '\n' || str === '\r') process.stdout.write(str);
      } else {
        process.stdout.write(str);
      }
    };
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function ensureFirebaseAdminUser(email, displayName, password) {
  if (admin.apps.length === 0) {
    throw new Error('Firebase Admin SDK failed to initialize. Ensure backend/service-account.json is valid.');
  }
  const auth = admin.auth();
  let existing = null;
  try {
    existing = await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  if (existing) {
    const updated = await auth.updateUser(existing.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
    console.log(`Updated Firebase Auth user for ${email} (uid=${updated.uid}, emailVerified=true).`);
    return updated;
  }

  const created = await auth.createUser({
    email,
    displayName,
    password,
    emailVerified: true
  });
  console.log(`Created Firebase Auth user for ${email} (uid=${created.uid}, emailVerified=true).`);
  return created;
}

async function reconcileDatabaseAdmin({ username, email, name, firebaseUid }) {
  return prisma.$transaction(async (tx) => {
    const existingAdmin = await tx.user.findUnique({ where: { username } });
    const rowWithEmail = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });
    const rowWithUid = await tx.user.findUnique({ where: { firebaseUid } });

    const targetId = existingAdmin?.id || rowWithEmail?.id || rowWithUid?.id || null;

    // Relocate any separate row holding the target email or firebaseUid without deleting historical FK links
    const conflicts = [rowWithEmail, rowWithUid].filter(Boolean);
    const seen = new Set();
    for (const conflict of conflicts) {
      if (conflict.id === targetId || seen.has(conflict.id)) continue;
      seen.add(conflict.id);
      const suffix = `${Date.now()}-${conflict.id}`;
      await tx.user.update({
        where: { id: conflict.id },
        data: {
          email: `archived-${suffix}-${conflict.email}`,
          firebaseUid: `archived-${suffix}`,
          active: false
        }
      });
      console.log(`Archived conflicting ${conflict.role} row id=${conflict.id} (${conflict.email}) cleanly.`);
    }

    if (targetId) {
      return tx.user.update({
        where: { id: targetId },
        data: {
          username,
          email,
          name,
          firebaseUid,
          role: Role.ADMIN,
          emailVerified: true,
          active: true
        },
        select: { id: true, username: true, email: true, role: true, firebaseUid: true, emailVerified: true }
      });
    }

    return tx.user.create({
      data: {
        username,
        email,
        name,
        firebaseUid,
        role: Role.ADMIN,
        emailVerified: true,
        active: true
      },
      select: { id: true, username: true, email: true, role: true, firebaseUid: true, emailVerified: true }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.email.includes('@') || args.email.endsWith('.local')) {
    throw new Error(`Invalid deliverable admin email: "${args.email}". Pass a real email with --email.`);
  }

  let password = args.password;
  if (!password) {
    password = await promptHidden(`Enter Firebase password for ${args.email} (min 8 chars): `);
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  if (password === 'admin123' || password.length < 10) {
    console.warn('WARNING: Using a short or common password on an internet-exposed Admin account is strongly discouraged.');
  }

  const fbUser = await ensureFirebaseAdminUser(args.email, args.name, password);
  const dbAdmin = await reconcileDatabaseAdmin({
    username: args.username,
    email: args.email,
    name: args.name,
    firebaseUid: fbUser.uid
  });

  console.log('Reconciled PostgreSQL Admin user:', {
    id: dbAdmin.id,
    username: dbAdmin.username,
    email: dbAdmin.email,
    role: dbAdmin.role,
    firebaseUid: dbAdmin.firebaseUid,
    emailVerified: dbAdmin.emailVerified
  });

  if (!config.adminFirebaseUids.includes(fbUser.uid)) {
    console.log('\nNEXT STEP: Add this UID to ADMIN_FIREBASE_UIDS in backend/.env and reload PM2:');
    console.log(`  UID: ${fbUser.uid}`);
    console.log('  Command: npx pm2 reload ecosystem.config.cjs --update-env');
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
