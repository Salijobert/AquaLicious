import { config } from '../config/index.js';

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatManilaTime(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
}

function baseLayout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #e3eefa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #263238; }
    .wrapper { width: 100%; max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(11,61,145,0.08); border: 1px solid #cfd8dc; }
    .header { background: linear-gradient(135deg, #0b3d91 0%, #1565c0 100%); padding: 24px; text-align: center; color: #ffffff; }
    .brand-title { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .brand-sub { margin: 4px 0 0 0; font-size: 12px; color: #bbdefb; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 14px; }
    .btn { display: inline-block; background-color: #1565c0; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; margin: 20px 0; text-align: center; box-shadow: 0 2px 8px rgba(21,101,192,0.3); }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .table th { background: #f5f7fa; padding: 10px 12px; text-align: left; border-bottom: 2px solid #cfd8dc; color: #455a64; }
    .table td { padding: 10px 12px; border-bottom: 1px solid #eceff1; }
    .total-row { font-weight: 800; font-size: 15px; color: #0b3d91; }
    .footer { background: #f8fafc; padding: 20px 28px; border-top: 1px solid #eceff1; text-align: center; font-size: 11px; color: #78909c; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1 class="brand-title">AquaLicious</h1>
      <p class="brand-sub">Pure Refined Water Station & Distribution</p>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <p>This is an automated notification from AquaLicious (${escapeHtml(config.adminEmail)}).</p>
      <p>Please do not share sensitive links or tokens. If you need support, reply directly to this email.</p>
      <p>&copy; ${new Date().getFullYear()} AquaLicious. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

// 1. Email Verification
export function getVerificationEmailTemplate(params: { name: string; link: string }) {
  const safeName = escapeHtml(params.name);
  const safeLink = escapeHtml(params.link);

  const html = baseLayout(
    'Verify your AquaLicious Email',
    `<h2 style="margin-top:0; color:#0b3d91;">Verify Your Email Address</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>Thank you for creating an account with AquaLicious. To complete your registration and enable online water ordering, please verify your email address by clicking the button below:</p>
    <div style="text-align: center;">
      <a href="${safeLink}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
    </div>
    <p style="font-size:12px; color:#78909c;">Or copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#1565c0; word-break:break-all;">${safeLink}</a></p>
    <p>This verification link will expire in 24 hours. If you did not create this account, no further action is required.</p>`
  );

  const text = `Hello ${params.name},\n\nThank you for creating an account with AquaLicious.\nTo verify your email address and activate your ordering account, visit:\n${params.link}\n\nThis link expires in 24 hours.\n\n— AquaLicious Team`;

  return { subject: 'Verify Your AquaLicious Account', html, text };
}

// 2. Password Reset
export function getPasswordResetEmailTemplate(params: { name: string; link: string }) {
  const safeName = escapeHtml(params.name);
  const safeLink = escapeHtml(params.link);

  const html = baseLayout(
    'Reset your AquaLicious Password',
    `<h2 style="margin-top:0; color:#0b3d91;">Password Reset Request</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>We received a request to reset the password for your AquaLicious account. Click the button below to choose a new password:</p>
    <div style="text-align: center;">
      <a href="${safeLink}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
    </div>
    <p style="font-size:12px; color:#78909c;">Or copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#1565c0; word-break:break-all;">${safeLink}</a></p>
    <p style="color:#c62828; font-size:12px;"><strong>Security notice:</strong> If you did not request this password reset, please ignore this email. Your current password remains active.</p>`
  );

  const text = `Hello ${params.name},\n\nWe received a request to reset your AquaLicious password.\nReset your password here:\n${params.link}\n\nIf you did not request this, you can safely ignore this email.\n\n— AquaLicious Team`;

  return { subject: 'Reset Your AquaLicious Password', html, text };
}

// 3. Order Receipt
export interface OrderReceiptItem {
  name: string;
  qty: number;
  unitPrice: number | string;
  subtotal: number | string;
}

export function getOrderReceiptTemplate(params: {
  orderNumber: string;
  customerName: string;
  items: OrderReceiptItem[];
  total: number | string;
  paymentMethod: string;
  fulfillment: string;
  address?: string | null;
  createdAt?: Date | string;
}) {
  const safeName = escapeHtml(params.customerName);
  const safeOrderNo = escapeHtml(params.orderNumber);
  const safeMethod = escapeHtml(params.paymentMethod);
  const safeFulfillment = escapeHtml(params.fulfillment);
  const safeAddress = escapeHtml(params.address || 'Pick up at Station');
  const dateFormatted = formatManilaTime(params.createdAt || new Date());
  const numTotal = Number(params.total).toFixed(2);

  const rows = params.items
    .map(
      (item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td style="text-align:center;">${item.qty}</td>
      <td style="text-align:right;">₱${Number(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;">₱${Number(item.subtotal).toFixed(2)}</td>
    </tr>`
    )
    .join('');

  const html = baseLayout(
    `Order Receipt #${safeOrderNo}`,
    `<h2 style="margin-top:0; color:#0b3d91;">Order Receipt & Confirmation</h2>
    <p>Hello <strong>${safeName}</strong>, thank you for ordering from AquaLicious! Your order has been recorded.</p>
    <div style="background:#f8fafc; border-radius:8px; padding:12px 16px; margin-bottom:16px; font-size:13px; border:1px solid #e2e8f0;">
      <div><strong>Order Number:</strong> <span style="font-family:monospace; color:#1565c0;">#${safeOrderNo}</span></div>
      <div><strong>Date & Time:</strong> ${dateFormatted}</div>
      <div><strong>Fulfillment:</strong> ${safeFulfillment} ${params.address ? `(${safeAddress})` : ''}</div>
      <div><strong>Payment Method:</strong> ${safeMethod}</div>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Price</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="3" style="text-align:right; border-top:2px solid #cfd8dc;">Grand Total:</td>
          <td style="text-align:right; border-top:2px solid #cfd8dc;">₱${numTotal}</td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:12px; color:#546e7a;">You can track your order status live in your AquaLicious mobile app or web portal under the Orders tab.</p>`
  );

  const textLines = params.items
    .map((i) => `• ${i.name} x ${i.qty} @ ₱${Number(i.unitPrice).toFixed(2)} = ₱${Number(i.subtotal).toFixed(2)}`)
    .join('\n');

  const text = `AquaLicious Order Receipt\nOrder #${params.orderNumber}\nCustomer: ${params.customerName}\nDate: ${dateFormatted}\nFulfillment: ${params.fulfillment} (${params.address || 'Pickup'})\nPayment: ${params.paymentMethod}\n\nItems:\n${textLines}\n\nTotal: ₱${numTotal}\n\nThank you for choosing AquaLicious!`;

  return { subject: `AquaLicious Order Receipt #${params.orderNumber}`, html, text };
}

// 4. Order Status Update
export function getOrderStatusUpdateTemplate(params: {
  orderNumber: string;
  customerName: string;
  status: string;
  notes?: string | null;
}) {
  const safeName = escapeHtml(params.customerName);
  const safeOrderNo = escapeHtml(params.orderNumber);
  const safeStatus = escapeHtml(params.status);
  const safeNotes = escapeHtml(params.notes || '');

  const html = baseLayout(
    `Order #${safeOrderNo} Status Update`,
    `<h2 style="margin-top:0; color:#0b3d91;">Order Status Update</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>Your order <strong>#${safeOrderNo}</strong> has been updated to:</p>
    <div style="text-align:center; margin:20px 0;">
      <span style="display:inline-block; padding:8px 20px; background:#e3f2fd; color:#0b3d91; font-weight:800; font-size:16px; border-radius:20px; border:1px solid #90caf9;">
        ${safeStatus}
      </span>
    </div>
    ${safeNotes ? `<p style="background:#f5f7fa; padding:12px; border-radius:8px; border-left:4px solid #1565c0; font-size:13px;"><strong>Station Notes:</strong> ${safeNotes}</p>` : ''}
    <p style="font-size:12px; color:#78909c;">Check your AquaLicious app for live delivery updates or contact our station for immediate inquiries.</p>`
  );

  const text = `Hello ${params.customerName},\n\nYour AquaLicious order #${params.orderNumber} status is now: ${params.status}.\n${params.notes ? `Notes: ${params.notes}\n` : ''}\n— AquaLicious Team`;

  return { subject: `Order #${params.orderNumber} Status: ${params.status}`, html, text };
}

// 5. Admin Alert (New order or proof uploaded)
export function getAdminOrderAlertTemplate(params: {
  orderNumber: string;
  customerName: string;
  total: number | string;
  paymentMethod: string;
  fulfillment: string;
  type: 'NEW_ORDER' | 'PAYMENT_CLAIM';
}) {
  const safeOrder = escapeHtml(params.orderNumber);
  const safeCustomer = escapeHtml(params.customerName);
  const actionText = params.type === 'NEW_ORDER' ? 'New Customer Order Placed' : 'Payment Proof Submitted';

  const html = baseLayout(
    `Station Alert: ${actionText} #${safeOrder}`,
    `<h2 style="margin-top:0; color:#0b3d91;">${actionText}</h2>
    <p>A new event requires station attention:</p>
    <ul>
      <li><strong>Order:</strong> #${safeOrder}</li>
      <li><strong>Customer:</strong> ${safeCustomer}</li>
      <li><strong>Amount:</strong> ₱${Number(params.total).toFixed(2)}</li>
      <li><strong>Payment Method:</strong> ${escapeHtml(params.paymentMethod)}</li>
      <li><strong>Fulfillment:</strong> ${escapeHtml(params.fulfillment)}</li>
    </ul>
    <div style="text-align: center;">
      <a href="${config.frontendUrl}/orders" class="btn" target="_blank">Open Station Orders</a>
    </div>`
  );

  const text = `AquaLicious Station Alert: ${actionText}\nOrder #${params.orderNumber} by ${params.customerName}\nTotal: ₱${Number(params.total).toFixed(2)}\nView at: ${config.frontendUrl}/orders`;

  return { subject: `[AquaLicious Alert] ${actionText} #${params.orderNumber}`, html, text };
}

// 6. Verification Reminder (Day 20 & Day 27 warning)
export function getVerificationReminderTemplate(params: {
  name: string;
  link: string;
  deadlineDate: Date | string;
  daysRemaining: number;
}) {
  const safeName = escapeHtml(params.name);
  const safeLink = escapeHtml(params.link);
  const formattedDeadline = formatManilaTime(params.deadlineDate);
  const daysText = params.daysRemaining === 1 ? '1 day' : `${params.daysRemaining} days`;

  const html = baseLayout(
    `Action Required: ${daysText} left to verify your account`,
    `<h2 style="margin-top:0; color:#d32f2f;">Action Required: Verify Your Account</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>We noticed that you have not yet verified your email address for AquaLicious.</p>
    <div style="background:#fff3e0; border-left:4px solid #f57c00; padding:12px 16px; margin:16px 0; border-radius:4px;">
      <p style="margin:0; font-size:13px; color:#e65100;">
        <strong>Deadline Notice:</strong> In accordance with our security and data privacy policies, unverified accounts are automatically deleted after 30 days.
      </p>
      <p style="margin:6px 0 0 0; font-size:13px; color:#bf360c;">
        You have <strong>${daysText} remaining</strong> (until <strong>${formattedDeadline}</strong>) to verify your account before it is permanently removed.
      </p>
    </div>
    <p>To keep your account and enjoy ordering pure refined water online, please verify your email now:</p>
    <div style="text-align: center;">
      <a href="${safeLink}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
    </div>
    <p style="font-size:12px; color:#78909c;">Or copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#1565c0; word-break:break-all;">${safeLink}</a></p>
    <p style="font-size:12px; color:#78909c;">If you did not register for AquaLicious, you can disregard this email. The unverified account will be automatically purged.</p>`
  );

  const text = `Hello ${params.name},\n\nYour AquaLicious account has not been verified yet.\nYou have ${daysText} remaining (until ${formattedDeadline}) to verify your email.\n\nIn accordance with our data privacy policy, unverified accounts are automatically removed after 30 days.\n\nVerify your account now:\n${params.link}\n\n— AquaLicious Team`;

  return { subject: `Action Required: ${daysText} left to verify your AquaLicious account`, html, text };
}
