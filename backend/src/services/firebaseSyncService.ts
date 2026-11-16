import admin from 'firebase-admin';
import { prisma, config } from '../config/index.js';
import { Role } from '@prisma/client';

export class FirebaseSyncService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Start periodic background sync.
   * Runs 3 seconds after server boot, then every 30 minutes.
   */
  public static startSchedule(): void {
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId !== undefined && instanceId !== '0') {
      return;
    }

    // Run initial sync after server finishes binding port
    setTimeout(() => {
      this.syncUsers().catch(err => {
        console.warn('[FirebaseSync] Initial background sync error:', err.message);
      });
    }, 3000);

    // Run every 30 minutes
    const INTERVAL_MS = 30 * 60 * 1000;
    this.timer = setInterval(() => {
      this.syncUsers().catch(err => {
        console.warn('[FirebaseSync] Periodic background sync error:', err.message);
      });
    }, INTERVAL_MS);

    console.log('[FirebaseSync] Automated Firebase-to-PostgreSQL user sync active (every 30m).');
  }

  public static stopSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Synchronizes all users from Firebase Auth into local PostgreSQL.
   */
  public static async syncUsers(): Promise<{ total: number; created: number; updated: number }> {
    if (this.isRunning) {
      return { total: 0, created: 0, updated: 0 };
    }

    if (admin.apps.length === 0) {
      return { total: 0, created: 0, updated: 0 };
    }

    this.isRunning = true;
    let nextPageToken: string | undefined;
    let totalProcessed = 0;
    let createdCount = 0;
    let updatedCount = 0;

    try {
      const auth = admin.auth();
      do {
        const listResult = await auth.listUsers(1000, nextPageToken);
        nextPageToken = listResult.pageToken;

        for (const fbUser of listResult.users) {
          totalProcessed++;
          const email = (fbUser.email || '').trim().toLowerCase();
          if (!email) continue;

          const displayName = fbUser.displayName || email.split('@')[0] || 'Customer';
          const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || `user_${totalProcessed}`;
          const isAdmin = config.adminFirebaseUids.includes(fbUser.uid) || email === config.adminEmail?.toLowerCase();
          const role = isAdmin ? Role.ADMIN : Role.CUSTOMER;

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
          } else {
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

            await prisma.userConsent.create({
              data: {
                userId: newUser.id,
                consent: true,
                termsVersion: '2.0.0'
              }
            }).catch(() => {});

            createdCount++;
          }
        }
      } while (nextPageToken);

      if (createdCount > 0 || updatedCount > 0) {
        console.log(`[FirebaseSync] Automatically synced ${totalProcessed} users (${createdCount} created, ${updatedCount} updated).`);
      }
    } catch (err: any) {
      console.warn('[FirebaseSync] Background sync exception:', err.message);
    } finally {
      this.isRunning = false;
    }

    return { total: totalProcessed, created: createdCount, updated: updatedCount };
  }
}
