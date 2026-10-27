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

export class Mailer {
  private static transporter: Transporter | null = null;
  private static isConfigured = false;
  private static queue: QueuedMail[] = [];
  private static isProcessing = false;
  public static mockSentEmails: QueuedMail[] = []; // In-memory store for automated test assertion

  public static initialize() {
    const hasCredentials = Boolean(config.smtpUser && config.smtpPass);

    if (hasCredentials && config.nodeEnv !== 'test' && process.env.AQ_MOCK_MAIL !== 'true') {
      try {
        this.transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPass
          }
        });

        this.transporter.verify((error: Error | null) => {
          if (error) {
            console.warn('[Mailer] SMTP transport verification warning:', error.message);
            this.isConfigured = false;
          } else {
            this.isConfigured = true;
            console.log(`[Mailer] Nodemailer ready over Gmail SMTP (${config.adminEmail})`);
          }
        });
      } catch (err: any) {
        console.warn('[Mailer] Initialization error:', err.message);
        this.isConfigured = false;
      }
    } else {
      console.log('[Mailer] Running in mock/development mail mode. Outbound emails logged to in-memory store.');
      this.isConfigured = false;
    }
  }

  /**
   * Main non-blocking send function.
   * Enqueues the email for asynchronous dispatch so caller is never blocked.
   */
  public static async enqueue(mail: QueuedMail): Promise<void> {
    // 1. Idempotency deduplication for order receipts: prevent duplicate receipts on retry
    if (mail.type === 'ORDER_RECEIPT') {
      const orConditions: any[] = [];
      if (mail.orderId) orConditions.push({ orderId: mail.orderId, type: 'ORDER_RECEIPT' });
      if (mail.idempotencyKey) orConditions.push({ idempotencyKey: mail.idempotencyKey });

      if (orConditions.length > 0) {
        const existing = await prisma.emailLog.findFirst({
          where: {
            OR: orConditions,
            status: 'SENT'
          }
        });
        if (existing) {
          console.log(`[Mailer] Duplicate ORDER_RECEIPT for order #${mail.orderId || mail.idempotencyKey} skipped via idempotency check.`);
          return;
        }
      }
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
      userId: params.userId
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
