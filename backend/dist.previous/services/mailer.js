import nodemailer from 'nodemailer';
import { config, prisma } from '../config/index.js';
import { getVerificationEmailTemplate, getPasswordResetEmailTemplate, getOrderReceiptTemplate, getOrderStatusUpdateTemplate, getAdminOrderAlertTemplate, getVerificationReminderTemplate } from './mailTemplates.js';
import { buildFirebaseVerificationLink } from '../utils/verificationLink.js';
export class Mailer {
    static transporter = null;
    static isConfigured = false;
    static queue = [];
    static isProcessing = false;
    static recentVerificationDispatches = new Map();
    static recentPasswordResetDispatches = new Map();
    static mockSentEmails = []; // In-memory store for automated test assertion
    static getStatus() {
        return { configured: this.isConfigured };
    }
    static async hasRecentEmailOfType(type, inMemMap, toEmail, windowMs = 60_000) {
        const cleanEmail = (toEmail || '').trim().toLowerCase();
        if (!cleanEmail)
            return { recent: false, retryAfterSeconds: 0 };
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
    static async hasRecentVerificationEmail(toEmail, windowMs = 60_000) {
        return this.hasRecentEmailOfType('VERIFICATION', this.recentVerificationDispatches, toEmail, windowMs);
    }
    /**
     * Checks whether a PASSWORD_RESET email was already queued or logged within the cooldown window.
     */
    static async hasRecentPasswordResetEmail(toEmail, windowMs = 60_000) {
        return this.hasRecentEmailOfType('PASSWORD_RESET', this.recentPasswordResetDispatches, toEmail, windowMs);
    }
    static initialize() {
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
                this.transporter.verify((error) => {
                    if (error) {
                        console.warn('[Mailer] SMTP transport verification warning:', error.message);
                        this.isConfigured = false;
                    }
                    else {
                        this.isConfigured = true;
                        console.log(`[Mailer] Nodemailer ready over Gmail SMTP (${config.adminEmail})`);
                    }
                });
            }
            catch (err) {
                console.warn('[Mailer] Initialization error:', err.message);
                this.isConfigured = false;
            }
        }
        else {
            console.log('[Mailer] Running in mock/development mail mode. Outbound emails logged to in-memory store.');
            this.isConfigured = false;
        }
        // Process any pending outbox rows left from previous runs or restarts
        this.processPendingOutbox().catch(() => { });
        if (!this.outboxTimer) {
            this.outboxTimer = setInterval(() => {
                this.processPendingOutbox().catch(() => { });
            }, 15000);
            if (this.outboxTimer.unref)
                this.outboxTimer.unref();
        }
    }
    static isOutboxProcessing = false;
    static outboxTimer = null;
    /**
     * Durable DB-backed outbox enqueue for registration verification.
     * Inserts a PENDING email_logs record with idempotencyKey = REG_VERIFY_<userId>.
     * Survives process restarts and guarantees exactly one verification email per registration.
     */
    static async enqueueRegistrationVerification(userId, email, name) {
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
            console.log(`[Mailer] Verification email for user #${userId} already in outbox (status: ${existing.status}). Skipping duplicate.`);
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
    static async processPendingOutbox() {
        if (this.isOutboxProcessing)
            return;
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
                        }
                        else {
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
                }
                catch (dispatchErr) {
                    console.error(`[Mailer Outbox] Failed to send email #${log.id} to ${log.toEmail}:`, dispatchErr?.message || dispatchErr);
                    await prisma.emailLog.update({
                        where: { id: log.id },
                        data: {
                            status: 'FAILED',
                            error: dispatchErr?.message || 'Unknown dispatch error'
                        }
                    });
                }
            }
        }
        catch (outboxErr) {
            console.warn('[Mailer Outbox] Error querying pending emails:', outboxErr?.message || outboxErr);
        }
        finally {
            this.isOutboxProcessing = false;
        }
    }
    /**
     * Main non-blocking send function.
     * Enqueues the email for asynchronous dispatch so caller is never blocked.
     */
    static async enqueue(mail) {
        // 1. Idempotency deduplication for order receipts and idempotent order status emails
        if (mail.type === 'ORDER_RECEIPT' || (mail.type === 'ORDER_STATUS' && mail.idempotencyKey)) {
            const orConditions = [];
            if (mail.type === 'ORDER_RECEIPT' && mail.orderId)
                orConditions.push({ orderId: mail.orderId, type: 'ORDER_RECEIPT' });
            if (mail.idempotencyKey)
                orConditions.push({ idempotencyKey: mail.idempotencyKey });
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
    static async processQueue() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const mail = this.queue.shift();
            if (!mail)
                break;
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
                }
                else {
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
            }
            catch (err) {
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
                }
                catch (logErr) {
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
    static async sendVerificationEmail(toEmail, name, link, userId) {
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
    static async sendPasswordResetEmail(toEmail, name, link, userId) {
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
    static async sendOrderReceipt(params) {
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
    static async sendOrderStatusUpdate(params) {
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
    static async sendAdminOrderAlert(params) {
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
    static async sendVerificationReminder(params) {
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
