import admin from 'firebase-admin';
import { prisma, config } from '../config/index.js';
import { Mailer } from './mailer.js';
import { buildFirebaseVerificationLink } from '../utils/verificationLink.js';

const ADVISORY_LOCK_ID = 8492019;

export interface CleanupResult {
  purgedCount: number;
  skippedCount: number;
  remindedCount: number;
  dryRun: boolean;
  errors: string[];
}

export class AccountCleanupService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Initialize schedule runner (runs daily at 3:00 AM Asia/Manila).
   * Guards against multiple executions in PM2 cluster mode:
   * Only NODE_APP_INSTANCE === '0' or standalone instance runs the scheduler.
   */
  public static startSchedule(): void {
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId !== undefined && instanceId !== '0') {
      console.log(`[AccountCleanup] PM2 cluster worker ${instanceId} skipping cleanup scheduler (primary is worker 0).`);
      return;
    }

    console.log('[AccountCleanup] Cleanup scheduler active on primary worker.');
    this.scheduleNextRun();
  }

  public static stopSchedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedules next execution at ~3:00 AM Asia/Manila (UTC+8).
   */
  private static scheduleNextRun(): void {
    const now = new Date();
    // Manila is UTC+8
    const manilaOffsetMs = 8 * 60 * 60 * 1000;
    const nowInManila = new Date(now.getTime() + manilaOffsetMs);

    const next3amManila = new Date(nowInManila);
    next3amManila.setUTCHours(3, 0, 0, 0);

    // If 3:00 AM in Manila already passed today, schedule for tomorrow
    if (next3amManila.getTime() <= nowInManila.getTime()) {
      next3amManila.setUTCDate(next3amManila.getUTCDate() + 1);
    }

    const delayMs = next3amManila.getTime() - nowInManila.getTime();
    console.log(`[AccountCleanup] Next 3 AM Asia/Manila cleanup scheduled in ${Math.round(delayMs / 60000)} minutes.`);

    this.timer = setTimeout(async () => {
      try {
        await this.runCleanup();
      } catch (err: any) {
        console.error('[AccountCleanup] Unhandled error in scheduled cleanup:', err);
      } finally {
        this.scheduleNextRun();
      }
    }, delayMs);
  }

  /**
   * Main cleanup execution with PostgreSQL advisory lock protection.
   */
  public static async runCleanup(options?: { dryRun?: boolean; forceRun?: boolean }): Promise<CleanupResult> {
    const isDryRun = options?.dryRun ?? config.cleanupDryRun;
    const result: CleanupResult = {
      purgedCount: 0,
      skippedCount: 0,
      remindedCount: 0,
      dryRun: isDryRun,
      errors: []
    };

    if (this.isRunning && !options?.forceRun) {
      console.log('[AccountCleanup] Cleanup is already currently running. Skipping concurrent run.');
      return result;
    }

    this.isRunning = true;
    let lockAcquired = false;

    try {
      // 1. Acquire PostgreSQL advisory lock to ensure only one worker/process runs this
      const lockCheck = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as acquired;
      `;
      lockAcquired = lockCheck?.[0]?.acquired === true;

      if (!lockAcquired) {
        console.log('[AccountCleanup] PostgreSQL advisory lock 8492019 could not be acquired (held by another worker). Skipping.');
        return result;
      }

      console.log(`[AccountCleanup] Starting unverified account cleanup (dryRun: ${isDryRun})...`);

      const now = new Date();

      // 2. Query expired unverified customers
      const expiredUsers = await prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          emailVerified: false,
          verificationDeadline: {
            lte: now
          }
        },
        include: {
          salesOrders: { select: { id: true } },
          stockMovements: { select: { id: true } }
        }
      });

      console.log(`[AccountCleanup] Found ${expiredUsers.length} candidate unverified accounts with deadline <= now.`);

      for (const user of expiredUsers) {
        // Safety Check 1: NEVER delete an ADMIN
        if ((user.role as string) === 'ADMIN') {
          const err = `CRITICAL SAFETY ABORT: User #${user.id} (${user.email}) has role ${user.role}. Refusing deletion.`;
          console.error(`[AccountCleanup] ${err}`);
          result.errors.push(err);
          result.skippedCount++;
          continue;
        }

        // Safety Check 2: NEVER delete user with sales orders or stock records
        if (user.salesOrders.length > 0 || user.stockMovements.length > 0) {
          const err = `SAFETY ABORT: User #${user.id} (${user.email}) has ${user.salesOrders.length} orders and ${user.stockMovements.length} stock movements. Deletion skipped; alerting administrator.`;
          console.error(`[AccountCleanup] ${err}`);
          result.errors.push(err);
          result.skippedCount++;
          continue;
        }

        // Safety Check 3: Check Firebase status; if user verified in Firebase, sync to PostgreSQL and preserve.
        // On any Firebase Admin error other than a definite 'auth/user-not-found', fail closed: skip deletion!
        let isVerifiedInFirebase = false;
        let shouldSkipUser = false;

        if (admin.apps.length > 0 && user.firebaseUid) {
          try {
            const fbUser = await admin.auth().getUser(user.firebaseUid);
            if (fbUser.emailVerified) {
              isVerifiedInFirebase = true;
            }
          } catch (fbErr: any) {
            if (fbErr.code === 'auth/user-not-found') {
              console.log(`[AccountCleanup] User ${user.firebaseUid} confirmed not found in Firebase Auth.`);
            } else {
              // Any transient error (network error, rate limit, socket hang up) -> FAIL CLOSED (skip deletion)
              const err = `FIREBASE CHECK ERROR for User #${user.id} (${user.firebaseUid}): ${fbErr.message} (code: ${fbErr.code}). Failing closed: skipping user deletion.`;
              console.warn(`[AccountCleanup] ${err}`);
              result.errors.push(err);
              result.skippedCount++;
              shouldSkipUser = true;
            }
          }
        }

        if (shouldSkipUser) {
          continue;
        }

        if (isVerifiedInFirebase) {
          console.log(`[AccountCleanup] User #${user.id} (${user.email}) is verified in Firebase. Syncing to PostgreSQL and skipping deletion.`);
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true }
          });
          result.skippedCount++;
          continue;
        }

        // 3. Dry-run handling
        if (isDryRun) {
          console.log(`[AccountCleanup] [DRY RUN] Would delete unverified customer #${user.id} (${user.email}), deadline was ${user.verificationDeadline?.toISOString()}`);
          result.purgedCount++;
          continue;
        }

        // 4. Real Deletion
        try {
          // Delete from Firebase Auth if exists
          if (admin.apps.length > 0 && user.firebaseUid) {
            try {
              await admin.auth().deleteUser(user.firebaseUid);
              console.log(`[AccountCleanup] Deleted Firebase user ${user.firebaseUid}`);
            } catch (delErr: any) {
              if (delErr.code !== 'auth/user-not-found') {
                const err = `FIREBASE DELETE ERROR for User #${user.id} (${user.firebaseUid}): ${delErr.message}. Failing closed: skipping database deletion.`;
                console.warn(`[AccountCleanup] ${err}`);
                result.errors.push(err);
                result.skippedCount++;
                continue;
              }
            }
          }

          // Clean up idempotency logs
          await prisma.idempotencyLog.deleteMany({
            where: { userId: user.id }
          });

          // Delete user row (UserConsent and EmailLog cascade via onDelete: Cascade)
          await prisma.user.delete({
            where: { id: user.id }
          });

          // Audit log the purge
          await prisma.auditLog.create({
            data: {
              action: 'ACCOUNT_AUTO_PURGE_EXPIRED',
              entity: 'User',
              entityId: user.id,
              details: JSON.stringify({
                email: user.email,
                username: user.username,
                deadline: user.verificationDeadline,
                purgedAt: now.toISOString()
              })
            }
          });

          console.log(`[AccountCleanup] Successfully purged unverified user #${user.id} (${user.email}).`);
          result.purgedCount++;
        } catch (delErr: any) {
          const err = `Failed to purge user #${user.id} (${user.email}): ${delErr.message}`;
          console.error(`[AccountCleanup] ${err}`);
          result.errors.push(err);
        }
      }

      // 5. Day 20 and Day 27 Reminders for unverified accounts
      await this.sendVerificationReminders(now, result);

      console.log(`[AccountCleanup] Cleanup complete. Purged: ${result.purgedCount}, Skipped: ${result.skippedCount}, Reminded: ${result.remindedCount}, DryRun: ${isDryRun}.`);
      return result;
    } catch (err: any) {
      console.error('[AccountCleanup] Error during unverified account cleanup:', err);
      result.errors.push(err.message);
      return result;
    } finally {
      if (lockAcquired) {
        try {
          await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID});`;
        } catch (unlockErr: any) {
          console.warn('[AccountCleanup] Failed to release PostgreSQL advisory lock:', unlockErr.message);
        }
      }
      this.isRunning = false;
    }
  }

  /**
   * Sends reminder emails at Day 20 (~10 days left) and Day 27 (~3 days left)
   * before the 30-day unverified deadline.
   */
  private static async sendVerificationReminders(now: Date, result: CleanupResult): Promise<void> {
    try {
      const activeUnverified = await prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          emailVerified: false,
          verificationDeadline: {
            gt: now
          }
        }
      });

      for (const user of activeUnverified) {
        if (!user.verificationDeadline || !user.email) continue;

        const msRemaining = user.verificationDeadline.getTime() - now.getTime();
        const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

        let reminderStage: 'DAY_20' | 'DAY_27' | null = null;
        let idempotencyKey = '';

        if (daysRemaining <= 10 && daysRemaining > 3) {
          reminderStage = 'DAY_20';
          idempotencyKey = `reminder-day20-${user.id}`;
        } else if (daysRemaining <= 3 && daysRemaining >= 1) {
          reminderStage = 'DAY_27';
          idempotencyKey = `reminder-day27-${user.id}`;
        }

        if (!reminderStage) continue;

        // Check if reminder for this stage was already sent
        const alreadySent = await prisma.emailLog.findFirst({
          where: {
            userId: user.id,
            type: 'VERIFICATION_REMINDER',
            idempotencyKey,
            status: 'SENT'
          }
        });

        if (alreadySent) {
          continue; // Already notified for this stage
        }

        console.log(`[AccountCleanup] Queuing ${reminderStage} reminder for user #${user.id} (${user.email}), ${daysRemaining} days remaining.`);

        // Generate Firebase verification link pointing to clean frontend verification route
        let verificationLink = `${config.frontendUrl}/verify-email-complete?mode=verifyEmail`;
        try {
          verificationLink = await buildFirebaseVerificationLink(user.email, user.name);
        } catch (linkErr: any) {
          console.warn(`[AccountCleanup] Link generation warning for ${user.email}:`, linkErr.message);
        }

        await Mailer.sendVerificationReminder({
          toEmail: user.email,
          name: user.name,
          link: verificationLink,
          deadlineDate: user.verificationDeadline,
          daysRemaining,
          userId: user.id,
          idempotencyKey
        });

        result.remindedCount++;
      }
    } catch (reminderErr: any) {
      console.error('[AccountCleanup] Error dispatching verification reminders:', reminderErr.message);
      result.errors.push(`Reminder dispatch error: ${reminderErr.message}`);
    }
  }
}
