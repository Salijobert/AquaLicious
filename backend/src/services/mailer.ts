import nodemailer, { Transporter } from 'nodemailer';
import { config, prisma } from '../config/index.js';
import {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getOrderReceiptTemplate,
  getOrderStatusUpdateTemplate,
  getAdminOrderAlertTemplate,
  getVerificationReminderTemplate,
  OrderReceiptItem
} from './mailTemplates.js';
import { buildFirebaseVerificationLink } from '../utils/verificationLink.js';

export interface QueuedMail {
  id?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  type: 'VERIFICATION' | 'PASSWORD_RESET' | 'ORDER_RECEIPT' | 'ORDER_STATUS' | 'ADMIN_ALERT' | 'VERIFICATION_REMINDER';
  orderId?: number;
  userId?: number;
  idempotencyKey?: string;
  retries?: number;
}

export function classifyMailerError(err: any): { category: string; safeMessage: string } {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();

  if (code === 'EAUTH' || msg.includes('auth') || msg.includes('credential') || msg.includes('535') || msg.includes('username and password not accepted')) {
    return { category: 'AUTHENTICATION_ERROR', safeMessage: 'SMTP authentication failed. Verify Gmail App Password.' };
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ENETUNREACH' || msg.includes('connection refused') || msg.includes('getaddrinfo')) {
    return { category: 'CONNECTION_ERROR', safeMessage: 'Unable to connect to SMTP server host.' };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || msg.includes('timeout') || msg.includes('timed out')) {
    return { category: 'TIMEOUT_ERROR', safeMessage: 'SMTP greeting or connection timed out.' };
  }
  if (msg.includes('daily user sending limit') || msg.includes('rate limit') || msg.includes('450') || msg.includes('452') || msg.includes('too many')) {
    return { category: 'RATE_LIMIT_ERROR', safeMessage: 'SMTP sending limit reached.' };
  }
  if (msg.includes('unauthorized domain') || msg.includes('generateemailverificationlink')) {
    return { category: 'FIREBASE_LINK_ERROR', safeMessage: 'Firebase email verification action link generation failed.' };
  }
  if (msg.includes('transport_not_configured')) {
    return { category: 'TRANSPORT_NOT_CONFIGURED', safeMessage: 'Mail transport is not configured or offline.' };
  }
  return { category: 'DISPATCH_ERROR', safeMessage: 'Failed to deliver outbound email.' };
}

function extractAttemptCount(errorStr: string | null | undefined): number {
  if (!errorStr) return 0;
  const match = errorStr.match(/\[Attempt (\d+)\/\d+\]/);
  return match ? parseInt(match[1], 10) : 0;
}

export class Mailer {
  private static transporter: Transporter | null = null;
  private static isConfigured = false;
  private static transportStatus: 'CONNECTED' | 'AUTHENTICATION_FAILED' | 'CONNECTION_FAILED' | 'TIMEOUT' | 'NOT_CONFIGURED' | 'MOCK_DEV' = 'NOT_CONFIGURED';
  private static queue: QueuedMail[] = [];
  private static isProcessing = false;
  private static recentVerificationDispatches = new Map<string, number>();
  private static recentPasswordResetDispatches = new Map<string, number>();
  public static mockSentEmails: QueuedMail[] = []; // In-memory store for automated test assertion

  public static getStatus(): { configured: boolean; status: string } {
    return {
      configured: this.isConfigured,
      status: this.transportStatus
    };
  }

  public static async getOutboxStats(): Promise<{
    pending: number;
    failed: number;
    sent: number;
    oldestPendingAgeSeconds: number | null;
  }> {
    const [pending, failed, sent, oldestPending] = await Promise.all([
      prisma.emailLog.count({ where: { status: 'PENDING' } }),
      prisma.emailLog.count({ where: { status: 'FAILED' } }),
      prisma.emailLog.count({ where: { status: 'SENT' } }),
      prisma.emailLog.findFirst({
        where: { status: 'PENDING' },
        orderBy: { sentAt: 'asc' },
        select: { sentAt: true }
      })
    ]);

    const oldestPendingAgeSeconds = oldestPending
      ? Math.max(0, Math.floor((Date.now() - oldestPending.sentAt.getTime()) / 1000))
      : null;

    return {
      pending,
      failed,
      sent,
      oldestPendingAgeSeconds
    };
  }

  private static async hasRecentEmailOfType(
    type: 'VERIFICATION' | 'PASSWORD_RESET',
    inMemMap: Map<string, number>,
    toEmail: string,
    windowMs = 60_000
  ): Promise<{ recent: boolean; retryAfterSeconds: number }> {
    const cleanEmail = (toEmail || '').trim().toLowerCase();
    if (!cleanEmail) return { recent: false, retryAfterSeconds: 0 };
    const now = Date.now();
    const inMemAt = inMemMap.get(cleanEmail) || 0;
    if (now - inMemAt < windowMs) {
      return { recent: true, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - inMemAt)) / 1000)) };
    }

    const recentLog = await prisma.emailLog.findFirst({
      where: {
        toEmail: cleanEmail,
        type,
        status: 'SENT',
        sentAt: { gte: new Date(now - windowMs) }
      },
      orderBy: { sentAt: 'desc' }
    });

    if (recentLog) {
      const elapsed = now - recentLog.sentAt.getTime();
      if (elapsed < windowMs) {
        return { recent: true, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)) };
      }
    }

    return { recent: false, retryAfterSeconds: 0 };
  }

  /**
   * Checks whether a VERIFICATION email was already queued or logged within the cooldown window.
   */
  public static async hasRecentVerificationEmail(toEmail: string, windowMs = 60_000): Promise<{ recent: boolean; retryAfterSeconds: number }> {
    return this.hasRecentEmailOfType('VERIFICATION', this.recentVerificationDispatches, toEmail, windowMs);
  }

  /**
   * Checks whether a PASSWORD_RESET email was already queued or logged within the cooldown window.
   */
  public static async hasRecentPasswordResetEmail(toEmail: string, windowMs = 60_000): Promise<{ recent: boolean; retryAfterSeconds: number }> {
    return this.hasRecentEmailOfType('PASSWORD_RESET', this.recentPasswordResetDispatches, toEmail, windowMs);
  }

  public static initialize() {
    const hasCredentials = Boolean(config.smtpUser && config.smtpPass);

    if (hasCredentials && config.nodeEnv !== 'test' && process.env.AQ_MOCK_MAIL !== 'true') {
      try {
        this.transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          connectionTimeout: 10000,
          greetingTimeout: 5000,
          socketTimeout: 15000,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPass
          }
        });

        this.transporter.verify((error: Error | null) => {
          if (error) {
            const { category } = classifyMailerError(error);
            this.isConfigured = false;
            if (category === 'AUTHENTICATION_ERROR') this.transportStatus = 'AUTHENTICATION_FAILED';
            else if (category === 'CONNECTION_ERROR') this.transportStatus = 'CONNECTION_FAILED';
            else if (category === 'TIMEOUT_ERROR') this.transportStatus = 'TIMEOUT';
            else this.transportStatus = 'CONNECTION_FAILED';

            console.warn('[Mailer] SMTP transport verification warning:', category);
            console.log(`[Mailer] Transport health: ${this.transportStatus} | Outbox worker: RUNNING (interval: 15s)`);
          } else {
            this.isConfigured = true;
            this.transportStatus = 'CONNECTED';
            console.log(`[Mailer] Transport health: CONNECTED | Outbox worker: RUNNING (interval: 15s)`);
          }
        });
      } catch (err: any) {
        const { category } = classifyMailerError(err);
        this.transportStatus = 'CONNECTION_FAILED';
        console.warn('[Mailer] Initialization error:', category);
        this.isConfigured = false;
        console.log(`[Mailer] Transport health: ${this.transportStatus} | Outbox worker: RUNNING (interval: 15s)`);
      }
    } else {
      this.transportStatus = 'MOCK_DEV';
      this.isConfigured = false;
      console.log(`[Mailer] Transport health: MOCK_DEV | Outbox worker: RUNNING (interval: 15s)`);
    }

    // Process any pending outbox rows left from previous runs or restarts
    this.processPendingOutbox().catch(() => {});
    if (!this.outboxTimer) {
      this.outboxTimer = setInterval(() => {
        this.processPendingOutbox().catch(() => {});
      }, 15000);
      if (this.outboxTimer.unref) this.outboxTimer.unref();
    }
  }

  private static isOutboxProcessing = false;
  private static outboxTimer: NodeJS.Timeout | null = null;

  /**
   * Durable DB-backed outbox enqueue for registration verification.
   * Inserts a PENDING email_logs record with idempotencyKey = REG_VERIFY_<userId>.
   * Survives process restarts and guarantees exactly one verification email per registration.
   */
  public static async enqueueRegistrationVerification(userId: number, email: string, name: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    const idempotencyKey = `REG_VERIFY_${userId}`;

    // Deduplication check: check if already queued or sent
    const existing = await prisma.emailLog.findFirst({
      where: {
        OR: [
          { idempotencyKey },
          { userId, type: 'VERIFICATION', status: 'SENT' }
        ]
      }
    });

    if (existing) {
      if (existing.status === 'SENT') {
        console.log(`[Mailer] Verification email for user #${userId} already sent. Skipping duplicate.`);
        return;
      }
      if (existing.status === 'FAILED') {
        // Recoverable retry: if previously failed, reset to PENDING so outbox worker can retry
        console.log(`[Mailer] Verification email for user #${userId} previously failed. Resetting to PENDING.`);
        await prisma.emailLog.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            error: null,
            sentAt: new Date()
          }
        });
        this.processPendingOutbox().catch(() => {});
        return;
      }
      console.log(`[Mailer] Verification email for user #${userId} already in outbox (PENDING). Skipping duplicate.`);
      return;
    }

    await prisma.emailLog.create({
      data: {
        type: 'VERIFICATION',
        userId,
        toEmail: cleanEmail,
        status: 'PENDING',
        idempotencyKey
      }
    });

    // Trigger outbox processing asynchronously without blocking
    this.processPendingOutbox().catch((err) => {
      console.warn('[Mailer] Immediate outbox trigger error:', err?.message || err);
    });
  }

  /**
   * Processes pending records from the email_logs table with backoff and retries.
   */
  public static async processPendingOutbox(): Promise<void> {
    if (this.isOutboxProcessing) return;
    this.isOutboxProcessing = true;

    try {
      const pendingLogs = await prisma.emailLog.findMany({
        where: { status: 'PENDING' },
        take: 10,
        orderBy: { id: 'asc' },
        include: { user: true }
      });

      for (const log of pendingLogs) {
        try {
          if (log.type === 'VERIFICATION') {
            const userName = log.user?.name || log.toEmail.split('@')[0] || 'Customer';
            const verificationLink = await buildFirebaseVerificationLink(log.toEmail, userName);
            const template = getVerificationEmailTemplate({ name: userName, link: verificationLink });

            if (this.isConfigured && this.transporter) {
              await this.transporter.sendMail({
                from: `"${config.mailFromName}" <${config.adminEmail}>`,
                to: log.toEmail,
                replyTo: config.adminEmail,
                subject: template.subject,
                html: template.html,
                text: template.text
              });
            } else if (config.nodeEnv !== 'production' || process.env.AQ_MOCK_MAIL === 'true') {
              this.mockSentEmails.push({
                to: log.toEmail,
                subject: template.subject,
                html: template.html,
                text: template.text,
                type: 'VERIFICATION',
                userId: log.userId ?? undefined,
                idempotencyKey: log.idempotencyKey ?? undefined
              });
              console.log(`[Mailer Mock/Dev] Outbox Verification Email -> ${log.toEmail}:`);
              console.log(`  Subject: ${template.subject}`);
            } else {
              throw new Error('TRANSPORT_NOT_CONFIGURED: Mail transport is not configured or offline');
            }

            await prisma.emailLog.update({
              where: { id: log.id },
              data: {
                status: 'SENT',
                sentAt: new Date(),
                error: null
              }
            });
          }
        } catch (dispatchErr: any) {
          const { category, safeMessage } = classifyMailerError(dispatchErr);
          const currentAttempts = extractAttemptCount(log.error) + 1;
          const maxRetries = 3;

          console.error(`[Mailer Outbox] Delivery attempt ${currentAttempts}/${maxRetries} failed for email #${log.id}: ${category}`);

          if (currentAttempts < maxRetries && category !== 'AUTHENTICATION_ERROR' && category !== 'TRANSPORT_NOT_CONFIGURED') {
            await prisma.emailLog.update({
              where: { id: log.id },
              data: {
                status: 'PENDING',
                error: `RETRY_PENDING: [Attempt ${currentAttempts}/${maxRetries}] ${category}: ${safeMessage}`
              }
            });
          } else {
            await prisma.emailLog.update({
              where: { id: log.id },
              data: {
                status: 'FAILED',
                error: `FAILED_MAX_RETRIES: [Attempt ${currentAttempts}/${maxRetries}] ${category}: ${safeMessage}`
              }
            });
          }
        }
      }
    } catch (outboxErr: any) {
      console.warn('[Mailer Outbox] Error querying pending emails:', outboxErr?.message || outboxErr);
    } finally {
      this.isOutboxProcessing = false;
    }
  }

  /**
   * Main non-blocking send function.
   * Enqueues the email for asynchronous dispatch so caller is never blocked.
   */
  public static async enqueue(mail: QueuedMail): Promise<void> {
    // 1. Idempotency deduplication for order receipts and idempotent order status emails
    if (mail.type === 'ORDER_RECEIPT' || (mail.type === 'ORDER_STATUS' && mail.idempotencyKey)) {
      const orConditions: any[] = [];
      if (mail.type === 'ORDER_RECEIPT' && mail.orderId) orConditions.push({ orderId: mail.orderId, type: 'ORDER_RECEIPT' });
      if (mail.idempotencyKey) orConditions.push({ idempotencyKey: mail.idempotencyKey });

      if (orConditions.length > 0) {
        const existing = await prisma.emailLog.findFirst({
          where: {
            OR: orConditions,
            status: 'SENT'
          }
        });
        if (existing) {
          console.log(`[Mailer] Duplicate ${mail.type} for order #${mail.orderId || mail.idempotencyKey} skipped via idempotency check.`);
          return;
        }
      }
    }

    // 1b. Deduplicate VERIFICATION and PASSWORD_RESET emails within a 60-second window per recipient
    if (mail.type === 'VERIFICATION') {
      const check = await this.hasRecentVerificationEmail(mail.to, 60_000);
      if (check.recent) {
        console.log(`[Mailer] Duplicate VERIFICATION email to ${mail.to} within 60s skipped.`);
        return;
      }
      this.recentVerificationDispatches.set(mail.to.trim().toLowerCase(), Date.now());
    }
    if (mail.type === 'PASSWORD_RESET') {
      const check = await this.hasRecentPasswordResetEmail(mail.to, 60_000);
      if (check.recent) {
        console.log(`[Mailer] Duplicate PASSWORD_RESET email to ${mail.to} within 60s skipped.`);
        return;
      }
      this.recentPasswordResetDispatches.set(mail.to.trim().toLowerCase(), Date.now());
    }

    mail.retries = mail.retries || 0;
    this.queue.push(mail);
    this.processQueue();
  }

  private static async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const mail = this.queue.shift();
      if (!mail) break;

      try {
        if (this.isConfigured && this.transporter) {
          await this.transporter.sendMail({
            from: `"${config.mailFromName}" <${config.adminEmail}>`,
            to: mail.to,
            replyTo: config.adminEmail,
            subject: mail.subject,
            html: mail.html,
            text: mail.text
          });
        } else {
          // Mock / dev record
          this.mockSentEmails.push(mail);
          console.log(`[Mailer Mock/Dev] Outbound Email (${mail.type}) -> ${mail.to}:`);
          console.log(`  Subject: ${mail.subject}`);
          const matchLink = mail.html.match(/href="([^"]+)"/);
          if (matchLink) {
            console.log(`  Action Link: ${matchLink[1]}`);
          }
        }

        // Record successful dispatch in immutable email log
        await prisma.emailLog.create({
          data: {
            type: mail.type,
            orderId: mail.orderId || null,
            userId: mail.userId || null,
            toEmail: mail.to,
            idempotencyKey: mail.idempotencyKey || null,
            status: 'SENT'
          }
        });
      } catch (err: any) {
        console.error(`[Mailer] Error sending email (${mail.type} to ${mail.to}):`, err.message);

        // Record failure
        try {
          await prisma.emailLog.create({
            data: {
              type: mail.type,
              orderId: mail.orderId || null,
              userId: mail.userId || null,
              toEmail: mail.to,
              idempotencyKey: mail.idempotencyKey || null,
              status: 'FAILED',
              error: err.message
            }
          });
        } catch (logErr: any) {
          console.warn('[Mailer] Could not record email failure to emailLog:', logErr.message);
        }

        // Simple backoff retry (up to 2 retries)
        const retries = mail.retries ?? 0;
        if (retries < 2) {
          mail.retries = retries + 1;
          setTimeout(() => {
            this.queue.push(mail);
            this.processQueue();
          }, mail.retries * 5000);
        }
      }
    }

    this.isProcessing = false;
  }

  // --- Convenience Methods ---

  public static async sendVerificationEmail(toEmail: string, name: string, link: string, userId?: number) {
    const template = getVerificationEmailTemplate({ name, link });
    return this.enqueue({
      to: toEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'VERIFICATION',
      userId
    });
  }

  public static async sendPasswordResetEmail(toEmail: string, name: string, link: string, userId?: number) {
    const template = getPasswordResetEmailTemplate({ name, link });
    return this.enqueue({
      to: toEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'PASSWORD_RESET',
      userId
    });
  }

  public static async sendOrderReceipt(params: {
    orderId: number;
    orderNumber: string;
    customerEmail: string;
    customerName: string;
    items: OrderReceiptItem[];
    total: number | string;
    paymentMethod: string;
    fulfillment: string;
    address?: string | null;
    createdAt?: Date | string;
    userId?: number;
    idempotencyKey?: string;
  }) {
    const template = getOrderReceiptTemplate({
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      items: params.items,
      total: params.total,
      paymentMethod: params.paymentMethod,
      fulfillment: params.fulfillment,
      address: params.address,
      createdAt: params.createdAt
    });

    return this.enqueue({
      to: params.customerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'ORDER_RECEIPT',
      orderId: params.orderId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey
    });
  }

  public static async sendOrderStatusUpdate(params: {
    orderId: number;
    orderNumber: string;
    customerEmail: string;
    customerName: string;
    status: string;
    notes?: string | null;
    userId?: number;
    idempotencyKey?: string;
  }) {
    const template = getOrderStatusUpdateTemplate({
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      status: params.status,
      notes: params.notes
    });

    return this.enqueue({
      to: params.customerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'ORDER_STATUS',
      orderId: params.orderId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey
    });
  }

  public static async sendAdminOrderAlert(params: {
    orderId: number;
    orderNumber: string;
    customerName: string;
    total: number | string;
    paymentMethod: string;
    fulfillment: string;
    type: 'NEW_ORDER' | 'PAYMENT_CLAIM';
  }) {
    const template = getAdminOrderAlertTemplate(params);
    return this.enqueue({
      to: config.adminEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'ADMIN_ALERT',
      orderId: params.orderId
    });
  }

  public static async sendVerificationReminder(params: {
    toEmail: string;
    name: string;
    link: string;
    deadlineDate: Date | string;
    daysRemaining: number;
    userId: number;
    idempotencyKey?: string;
  }) {
    const template = getVerificationReminderTemplate({
      name: params.name,
      link: params.link,
      deadlineDate: params.deadlineDate,
      daysRemaining: params.daysRemaining
    });

    return this.enqueue({
      to: params.toEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: 'VERIFICATION_REMINDER',
      userId: params.userId,
      idempotencyKey: params.idempotencyKey
    });
  }
}
