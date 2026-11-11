#!/usr/bin/env node
/**
 * Safe User Account Deletion and Anonymization Script
 * 
 * Default is DRY RUN. Pass --apply to perform actual database modifications.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." node tools/delete_or_anonymize_user.mjs --userId=<id> [--apply] [--adminId=<adminId>]
 * 
 * Safety:
 * - Dry run by default.
 * - Refuses to delete the last active administrator.
 * - Refuses self-deletion when --adminId matches --userId.
 * - Anonymizes if transactional history exists; hard-deletes if no history exists.
 * - Never prints connection strings or credentials.
 */

import { PrismaClient, Role } from '@prisma/client';
import admin from 'firebase-admin';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Example: DATABASE_URL="postgresql://..." node tools/delete_or_anonymize_user.mjs --userId=178');
  process.exit(1);
}

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = !isApply;

const userIdArg = args.find(a => a.startsWith('--userId='));
if (!userIdArg) {
  console.error('ERROR: --userId=<id> argument is required.');
  process.exit(1);
}
const targetUserId = parseInt(userIdArg.split('=')[1], 10);
if (isNaN(targetUserId)) {
  console.error('ERROR: Invalid userId number.');
  process.exit(1);
}

const adminIdArg = args.find(a => a.startsWith('--adminId='));
const executorAdminId = adminIdArg ? parseInt(adminIdArg.split('=')[1], 10) : null;

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } }
});

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      });
    } else {
      admin.initializeApp();
    }
  } catch (fbInitErr) {
    console.warn(`[Notice] Firebase Admin SDK not initialized with service credentials: ${fbInitErr.message}`);
  }
}

async function run() {
  console.log('='.repeat(70));
  console.log(`AquaLicious User Account Removal Tool`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no database changes will be made)' : 'LIVE EXECUTION (--apply)'}`);
  console.log(`Target User ID: ${targetUserId}`);
  console.log('='.repeat(70));

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      salesOrders: { select: { id: true } },
      verifiedOrders: { select: { id: true } },
      stockMovements: { select: { id: true } },
      consents: { select: { id: true } }
    }
  });

  if (!target) {
    console.error(`User with ID #${targetUserId} was not found in the database.`);
    process.exit(1);
  }

  // Self-deletion check
  if (executorAdminId && executorAdminId === targetUserId) {
    console.error(`ERROR: Administrator cannot delete or anonymize their own account.`);
    process.exit(1);
  }

  // Last admin check
  if (target.role === Role.ADMIN) {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: Role.ADMIN,
        active: true,
        id: { not: targetUserId }
      }
    });

    if (activeAdminCount === 0) {
      console.error(`ERROR: Cannot delete or anonymize the last active Administrator.`);
      process.exit(1);
    }
  }

  const orderCount = target.salesOrders.length;
  const verifiedOrderCount = target.verifiedOrders.length;
  const movementCount = target.stockMovements.length;
  const consentCount = target.consents.length;
  const hasHistory = (orderCount + verifiedOrderCount + movementCount) > 0;

  console.log(`\nAccount Summary:`);
  console.log(`- Role:                ${target.role}`);
  console.log(`- Status:              ${target.active ? 'ACTIVE' : 'DISABLED'}`);
  console.log(`- Placed Orders:       ${orderCount}`);
  console.log(`- Verified Orders:     ${verifiedOrderCount}`);
  console.log(`- Stock Movements:     ${movementCount}`);
  console.log(`- Consent Rows:        ${consentCount}`);
  console.log(`- Action Decision:     ${hasHistory ? 'ANONYMIZATION (historical records present)' : 'HARD-DELETE (no history)'}\n`);

  if (isDryRun) {
    console.log(`[DRY RUN] Actions that would be taken upon --apply:`);
    if (hasHistory) {
      console.log(`  1. Update user #${targetUserId}:`);
      console.log(`     - name: 'Removed user'`);
      console.log(`     - username: 'removed_user_${targetUserId}'`);
      console.log(`     - email: 'removed_user_${targetUserId}@example.invalid'`);
      console.log(`     - phone: null, address: null, active: false`);
      console.log(`  2. Update ${orderCount} sales order snapshot(s) -> customerName = 'Removed user'`);
      console.log(`  3. Disable Firebase Auth account and revoke refresh tokens (UID: ${target.firebaseUid})`);
      console.log(`  4. Insert AuditLog entry ('USER_ANONYMIZED')`);
    } else {
      console.log(`  1. Delete Firebase Auth account (UID: ${target.firebaseUid})`);
      console.log(`  2. Cascade/delete IdempotencyLog, UserConsent, EmailLog records for user #${targetUserId}`);
      console.log(`  3. Delete user row #${targetUserId} from users table`);
      console.log(`  4. Insert AuditLog entry ('USER_DELETED')`);
    }
    console.log(`\nTo execute these changes, re-run with the --apply flag:`);
    console.log(`DATABASE_URL="..." node tools/delete_or_anonymize_user.mjs --userId=${targetUserId} --apply\n`);
    return;
  }

  // LIVE EXECUTION
  console.log(`[LIVE EXECUTION] Applying changes...`);

  if (hasHistory) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          name: 'Removed user',
          username: `removed_user_${targetUserId}`,
          email: `removed_user_${targetUserId}@example.invalid`,
          phone: null,
          address: null,
          active: false
        }
      });

      if (orderCount > 0) {
        await tx.salesOrder.updateMany({
          where: { userId: targetUserId },
          data: { customerName: 'Removed user' }
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'USER_ANONYMIZED',
          entity: 'User',
          entityId: targetUserId,
          userId: executorAdminId || null,
          details: JSON.stringify({
            action: 'anonymized',
            reason: 'User account has transactional history and was anonymized to protect data privacy',
            ordersCount: orderCount,
            verifiedOrdersCount: verifiedOrderCount,
            stockMovementsCount: movementCount
          })
        }
      });
    });

    if (admin.apps.length > 0 && target.firebaseUid) {
      try {
        await admin.auth().updateUser(target.firebaseUid, {
          disabled: true,
          displayName: 'Removed user'
        });
        await admin.auth().revokeRefreshTokens(target.firebaseUid).catch(() => {});
        console.log(`  - Firebase Auth user ${target.firebaseUid} disabled and refresh tokens revoked.`);
      } catch (fbErr) {
        if (fbErr.code !== 'auth/user-not-found') {
          console.warn(`  - [Warning] Firebase disable error: ${fbErr.message}`);
        }
      }
    }

    console.log(`\nSUCCESS: User #${targetUserId} anonymized and disabled.`);
  } else {
    // Hard delete
    if (admin.apps.length > 0 && target.firebaseUid) {
      try {
        await admin.auth().deleteUser(target.firebaseUid);
        console.log(`  - Firebase Auth user ${target.firebaseUid} deleted.`);
      } catch (fbErr) {
        if (fbErr.code !== 'auth/user-not-found') {
          console.warn(`  - [Warning] Firebase delete error: ${fbErr.message}`);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.idempotencyLog.deleteMany({ where: { userId: targetUserId } });
      await tx.userConsent.deleteMany({ where: { userId: targetUserId } });
      await tx.emailLog.deleteMany({ where: { userId: targetUserId } });
      await tx.user.delete({ where: { id: targetUserId } });

      await tx.auditLog.create({
        data: {
          action: 'USER_DELETED',
          entity: 'User',
          entityId: targetUserId,
          userId: executorAdminId || null,
          details: JSON.stringify({
            action: 'deleted',
            deletedUserId: targetUserId
          })
        }
      });
    });

    console.log(`\nSUCCESS: User #${targetUserId} completely deleted from database and auth.`);
  }
}

run()
  .catch((err) => {
    console.error('Fatal error during execution:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
