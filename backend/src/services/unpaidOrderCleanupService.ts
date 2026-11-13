import { MovementType, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma, config } from '../config/index.js';
import { Mailer } from './mailer.js';

const AUTO_CANCEL_ADVISORY_LOCK_ID = 8492027;
const AUTO_CANCEL_POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface AutoCancelResult {
  cancelledCount: number;
  skippedCount: number;
  dryRun: boolean;
  candidateOrderIds: number[];
  cancelledOrderIds: number[];
  errors: string[];
}

export class UnpaidOrderCleanupService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Starts periodic unpaid E-Wallet order auto-cancellation on PM2 worker 0 or standalone server.
   */
  public static startSchedule(): void {
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId !== undefined && instanceId !== '0') {
      console.log(`[AutoCancel] PM2 cluster worker ${instanceId} skipping unpaid-order scheduler (primary is worker 0).`);
      return;
    }

    if (this.timer) return;

    console.log(
      `[AutoCancel] Unpaid E-Wallet scheduler active (TTL=${config.unpaidOrderTtlMinutes}m, dryRun=${config.autoCancelDryRun}).`
    );

    this.timer = setInterval(() => {
      this.runAutoCancel().catch((err: any) => {
        console.error('[AutoCancel] Scheduled run error:', err?.message || err);
      });
    }, AUTO_CANCEL_POLL_INTERVAL_MS);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public static stopSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Cancels unpaid E-Wallet orders older than ttlMinutes when paymentStatus is PENDING
   * and neither proof nor reference has been submitted.
   */
  public static async runAutoCancel(options?: {
    dryRun?: boolean;
    ttlMinutes?: number;
    now?: Date;
    forceRun?: boolean;
  }): Promise<AutoCancelResult> {
    const isDryRun = options?.dryRun ?? config.autoCancelDryRun;
    const ttlMinutes = Math.max(1, options?.ttlMinutes ?? config.unpaidOrderTtlMinutes);
    const now = options?.now ?? new Date();
    const cutoff = new Date(now.getTime() - ttlMinutes * 60 * 1000);

    const result: AutoCancelResult = {
      cancelledCount: 0,
      skippedCount: 0,
      dryRun: isDryRun,
      candidateOrderIds: [],
      cancelledOrderIds: [],
      errors: []
    };

    if (this.isRunning && !options?.forceRun) {
      console.log('[AutoCancel] Auto-cancel sweep already running. Skipping concurrent invocation.');
      return result;
    }

    this.isRunning = true;
    let lockAcquired = false;

    try {
      const lockCheck = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_lock(${AUTO_CANCEL_ADVISORY_LOCK_ID}) as acquired;
      `;
      lockAcquired = lockCheck?.[0]?.acquired === true;
      if (!lockAcquired) {
        console.log('[AutoCancel] Advisory lock held by another worker. Skipping.');
        return result;
      }

      const candidates = await prisma.salesOrder.findMany({
        where: {
          orderStatus: OrderStatus.PENDING,
          paymentMethod: {
            in: [PaymentMethod.E_WALLET, PaymentMethod.GCASH_QR, PaymentMethod.MAYA_QR]
          },
          paymentStatus: PaymentStatus.PENDING,
          proofBase64: null,
          OR: [{ paymentReference: null }, { paymentReference: '' }],
          createdAt: { lte: cutoff }
        },
        select: {
          id: true,
          orderNumber: true,
          userId: true,
          customerName: true,
          createdAt: true,
          user: { select: { email: true, name: true } }
        },
        orderBy: { id: 'asc' }
      });

      result.candidateOrderIds = candidates.map((c) => c.id);

      for (const candidate of candidates) {
        if (isDryRun) {
          console.log(
            `[AutoCancel] [DRY RUN] Would auto-cancel unpaid E-Wallet order #${candidate.orderNumber} (id=${candidate.id}, createdAt=${candidate.createdAt.toISOString()})`
          );
          result.cancelledCount++;
          continue;
        }

        try {
          const outcome = await prisma.$transaction(async (tx) => {
            // Lock SalesOrder row first (canonical lock order: sales_orders -> products)
            const lockedRows = await tx.$queryRaw<
              Array<{
                id: number;
                orderStatus: string;
                paymentStatus: string;
                paymentMethod: string;
                paymentReference: string | null;
                proofBase64: string | null;
                createdAt: Date;
              }>
            >`
              SELECT id, "orderStatus"::text AS "orderStatus", "paymentStatus"::text AS "paymentStatus",
                     "paymentMethod"::text AS "paymentMethod", "paymentReference", "proofBase64", "createdAt"
              FROM sales_orders
              WHERE id = ${candidate.id}
              FOR UPDATE
            `;

            const locked = lockedRows?.[0];
            if (!locked) return { cancelled: false, reason: 'missing' };

            const isEWallet =
              locked.paymentMethod === PaymentMethod.E_WALLET ||
              locked.paymentMethod === PaymentMethod.GCASH_QR ||
              locked.paymentMethod === PaymentMethod.MAYA_QR;
            const hasReference = Boolean(locked.paymentReference && locked.paymentReference.trim().length > 0);
            const stillExpired =
              locked.orderStatus === OrderStatus.PENDING &&
              isEWallet &&
              locked.paymentStatus === PaymentStatus.PENDING &&
              !locked.proofBase64 &&
              !hasReference &&
              new Date(locked.createdAt).getTime() <= cutoff.getTime();

            if (!stillExpired) {
              return { cancelled: false, reason: 'state_changed' };
            }

            const existingRelease = await tx.stockMovement.findFirst({
              where: {
                referenceId: candidate.id,
                movementType: MovementType.ORDER_RELEASE
              },
              select: { id: true }
            });

            await tx.salesOrder.update({
              where: { id: candidate.id },
              data: {
                orderStatus: OrderStatus.CANCELLED,
                cancelledAt: now,
                cancelledById: null,
                cancelReason: 'Auto-cancelled: unpaid',
                notes: 'Auto-cancelled: unpaid'
              }
            });

            if (!existingRelease) {
              const items = await tx.salesOrderItem.findMany({
                where: { salesOrderId: candidate.id },
                orderBy: { productId: 'asc' }
              });

              for (const item of items) {
                const prodRows: any[] = await tx.$queryRaw`
                  SELECT id, stock FROM products WHERE id = ${item.productId} FOR UPDATE
                `;
                if (prodRows && prodRows.length > 0) {
                  const cur = Number(prodRows[0].stock);
                  const restored = cur + item.quantity;
                  await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: restored }
                  });
                  await tx.stockMovement.create({
                    data: {
                      productId: item.productId,
                      movementType: MovementType.ORDER_RELEASE,
                      quantityChange: item.quantity,
                      previousBalance: cur,
                      newBalance: restored,
                      referenceId: candidate.id,
                      userId: candidate.userId,
                      notes: `Auto-cancelled unpaid order #${candidate.orderNumber}`
                    }
                  });
                }
              }
            }

            await tx.auditLog.create({
              data: {
                userId: null,
                action: 'ORDER_AUTO_CANCELLED_UNPAID',
                entity: 'SalesOrder',
                entityId: candidate.id,
                details: JSON.stringify({
                  orderNumber: candidate.orderNumber,
                  reason: 'Auto-cancelled: unpaid',
                  ttlMinutes,
                  cutoff: cutoff.toISOString()
                })
              }
            });

            return { cancelled: true };
          });

          if (!outcome.cancelled) {
            result.skippedCount++;
            continue;
          }

          result.cancelledCount++;
          result.cancelledOrderIds.push(candidate.id);

          if (candidate.user?.email) {
            await Mailer.sendOrderStatusUpdate({
              orderId: candidate.id,
              orderNumber: candidate.orderNumber,
              customerEmail: candidate.user.email,
              customerName: candidate.customerName || candidate.user.name || 'Customer',
              status: 'CANCELLED',
              notes: `Auto-cancelled: unpaid (payment was not completed within ${ttlMinutes} minutes).`,
              userId: candidate.userId,
              idempotencyKey: `order-cancel-${candidate.id}`
            }).catch((mailErr: any) => {
              console.warn(`[AutoCancel] Email dispatch warning for order #${candidate.orderNumber}:`, mailErr?.message);
            });
          }
        } catch (orderErr: any) {
          console.error(`[AutoCancel] Failed auto-cancelling order #${candidate.id}:`, orderErr?.message || orderErr);
          result.errors.push(`Order #${candidate.id}: ${orderErr?.message || 'Unknown error'}`);
        }
      }
    } finally {
      if (lockAcquired) {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${AUTO_CANCEL_ADVISORY_LOCK_ID});`.catch(() => {});
      }
      this.isRunning = false;
    }

    return result;
  }
}
