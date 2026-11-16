/**
 * AquaLicious Order and Payment Formatters & State Machine Helpers
 * Centralized human-readable label mapping and allowed action resolution.
 */

export function formatPaymentMethod(method?: string | null): string {
  if (!method) return 'Cash';
  const upper = method.toUpperCase();
  if (upper === 'E_WALLET' || upper === 'GCASH_QR' || upper === 'MAYA_QR') {
    return 'E-Wallet';
  }
  if (upper === 'CASH') {
    return 'Cash';
  }
  return method;
}

export function formatPaymentStatus(status?: string | null): string {
  if (!status) return 'Awaiting Payment';
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'Awaiting Payment';
    case 'SUBMITTED':
      return 'Proof Submitted – For Verification';
    case 'VERIFIED':
      return 'Verified';
    case 'REJECTED':
      return 'Rejected';
    case 'COMPLETED':
      return 'Completed';
    case 'REFUND_REQUIRED':
      return 'Refund Required';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function formatOrderStatus(status?: string | null): string {
  if (!status) return 'Pending';
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'PREPARING':
      return 'Preparing';
    case 'READY_FOR_PICKUP':
      return 'Ready for Pickup';
    case 'OUT_FOR_DELIVERY':
      return 'Out for Delivery';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function formatFulfillment(fulfillment?: string | null): string {
  if (!fulfillment) return 'Pickup';
  switch (fulfillment.toUpperCase()) {
    case 'PICKUP':
      return 'Pickup';
    case 'DELIVERY':
      return 'Delivery';
    case 'WALK_IN_POS':
      return 'Walk-in POS';
    default:
      return fulfillment.replace(/_/g, ' ');
  }
}

/**
 * Returns the human-readable fulfillment gating note for an unverified E-Wallet order.
 * Returns null if the order is cash or payment is already verified/completed.
 */
export function getPaymentGatingNote(order: {
  payment_method?: string | null;
  payment_status?: string | null;
  payment?: { method?: string; status?: string };
}): string | null {
  const method = order.payment_method || order.payment?.method || 'CASH';
  const status = order.payment_status || order.payment?.status || 'PENDING';
  const isEWallet = method !== 'CASH';

  if (!isEWallet) return null;
  if (status === 'VERIFIED' || status === 'COMPLETED') return null;

  switch (status) {
    case 'SUBMITTED':
      return 'Verify the payment to continue';
    case 'REJECTED':
      return 'Payment rejected';
    case 'PENDING':
    default:
      return 'Waiting for customer payment';
  }
}

/**
 * Determines allowed fulfillment actions for an order based on orderStatus, paymentMethod, and paymentStatus.
 * Falls back to order.allowed_actions returned from the API if present.
 */
export function getAllowedOrderActions(
  order: {
    status?: string | null;
    orderStatus?: string | null;
    payment_method?: string | null;
    payment_status?: string | null;
    payment?: { method?: string; status?: string };
    fulfillment?: string | null;
    allowed_actions?: string[];
  },
  isAdmin: boolean = true
): string[] {
  if (Array.isArray(order.allowed_actions)) {
    return order.allowed_actions;
  }

  const orderStatus = (order.status || order.orderStatus || 'PENDING').toUpperCase();
  const paymentMethod = (order.payment_method || order.payment?.method || 'CASH').toUpperCase();
  const paymentStatus = (order.payment_status || order.payment?.status || 'PENDING').toUpperCase();
  const fulfillment = (order.fulfillment || 'PICKUP').toUpperCase();

  if (orderStatus === 'COMPLETED' || orderStatus === 'CANCELLED' || orderStatus === 'VOIDED') {
    return [];
  }

  if (!isAdmin) {
    const isPaymentLockedForCancel =
      paymentStatus === 'SUBMITTED' ||
      paymentStatus === 'VERIFIED' ||
      paymentStatus === 'COMPLETED';
    return orderStatus === 'PENDING' && !isPaymentLockedForCancel ? ['CANCEL'] : [];
  }

  const isEWallet = paymentMethod !== 'CASH';
  const isVerified = paymentStatus === 'VERIFIED' || paymentStatus === 'COMPLETED';

  // If E-Wallet and not verified, no fulfillment actions are permitted
  if (isEWallet && !isVerified) {
    return ['CANCEL'];
  }

  const isPickup = fulfillment === 'PICKUP';
  const isDelivery = fulfillment === 'DELIVERY';

  switch (orderStatus) {
    case 'PENDING':
      return [
        'PREPARE',
        isPickup ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY',
        'CANCEL'
      ];
    case 'PREPARING':
      return [
        isDelivery ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP',
        'CANCEL'
      ];
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return ['COMPLETED', 'CANCEL'];
    default:
      return [];
  }
}

export function formatCashPaymentLabel(fulfillment?: string | null): string {
  const clean = (fulfillment || '').toUpperCase();
  if (clean === 'PICKUP') return 'Cash: pay on pickup';
  return 'Cash: pay on delivery';
}

export function formatManilaTimeOnly(dateInput: string | Date): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Comprehensive registration error mapper with friendly user messages and support codes.
 */
export function getRegistrationErrorMessage(err: any): { message: string; code: string; fullText: string } {
  const status = err?.status || err?.response?.status;
  const rawCode = String(err?.code || err?.response?.data?.code || '').trim();
  const rawMsg = String(err?.message || err?.response?.data?.error || '').trim();

  // 1. Role escalation
  if (rawCode === 'ROLE_NOT_PERMITTED' || rawMsg.includes('provision Customer access')) {
    return {
      message: 'Public registration must only provision Customer access.',
      code: 'REG-SEC-01',
      fullText: 'Public registration must only provision Customer access. [REG-SEC-01]'
    };
  }

  // 2. Terms Version Mismatch
  if (rawCode === 'TERMS_VERSION_MISMATCH' || rawMsg.includes('terms were updated') || rawMsg.includes('termsVersion')) {
    return {
      message: 'The terms were updated. Please refresh the page or update the app and try again.',
      code: 'REG-TRM-01',
      fullText: 'The terms were updated. Please refresh the page or update the app and try again. [REG-TRM-01]'
    };
  }

  // 3. Validation: Weak password
  if (rawCode === 'WEAK_PASSWORD' || rawCode === 'auth/weak-password' || rawMsg.includes('at least 6 characters') || rawMsg.includes('weak-password')) {
    return {
      message: 'Password must be at least 6 characters.',
      code: 'REG-VAL-01',
      fullText: 'Password must be at least 6 characters. [REG-VAL-01]'
    };
  }

  // 4. Validation: Invalid email
  if (rawCode === 'INVALID_EMAIL' || rawCode === 'auth/invalid-email' || rawMsg.includes('valid email address') || rawMsg.includes('invalid-email')) {
    return {
      message: 'A valid email address is required.',
      code: 'REG-VAL-02',
      fullText: 'A valid email address is required. [REG-VAL-02]'
    };
  }

  // 5. Validation: Prohibited name
  if (rawCode === 'NAME_NOT_ALLOWED' || rawMsg.includes('choose a different name')) {
    return {
      message: 'Please choose a different name.',
      code: 'REG-VAL-03',
      fullText: 'Please choose a different name. [REG-VAL-03]'
    };
  }

  // 6. Username Taken
  if (rawCode === 'USERNAME_ALREADY_EXISTS' || rawMsg.includes('Username already in use') || rawMsg.includes('already taken')) {
    return {
      message: 'That username is already taken. Please choose another one.',
      code: 'REG-USR-01',
      fullText: 'That username is already taken. Please choose another one. [REG-USR-01]'
    };
  }

  // 7. Email Already Registered
  if (rawCode === 'EMAIL_ALREADY_EXISTS' || rawCode === 'auth/email-already-in-use' || rawMsg.includes('email address already exists') || rawMsg.includes('already registered')) {
    return {
      message: 'This email may already be registered. Try signing in, or reset your password.',
      code: 'REG-EML-01',
      fullText: 'This email may already be registered. Try signing in, or reset your password. [REG-EML-01]'
    };
  }

  // 7b. Account Disabled in Authentication Service
  if (rawCode === 'ACCOUNT_DISABLED' || rawCode === 'auth/user-disabled' || rawMsg.includes('has been disabled')) {
    return {
      message: 'This user account has been disabled. Please contact the station.',
      code: 'REG-DIS-01',
      fullText: 'This user account has been disabled. Please contact the station. [REG-DIS-01]'
    };
  }

  // 8. Rate limit
  if (status === 429 || rawCode === 'TOO_MANY_REQUESTS' || rawCode === 'auth/too-many-requests' || rawMsg.includes('Too many attempts') || rawMsg.includes('too-many-requests') || rawMsg.includes('Too many registration attempts')) {
    return {
      message: 'Too many attempts. Please wait a few minutes and try again.',
      code: 'REG-RAT-01',
      fullText: 'Too many attempts. Please wait a few minutes and try again. [REG-RAT-01]'
    };
  }

  // 9. Timeout
  if (
    status === 504 ||
    rawCode === 'TIMEOUT' ||
    rawCode === 'GATEWAY_TIMEOUT' ||
    rawMsg.includes('took too long') ||
    rawMsg.includes('timed out') ||
    rawMsg.includes('TimeoutError')
  ) {
    return {
      message: 'The request took too long to complete. Please try again in a moment.',
      code: 'REG-NET-02',
      fullText: 'The request took too long to complete. Please try again in a moment. [REG-NET-02]'
    };
  }

  // 10. Server unreachable or HTML response
  if (
    rawCode === 'SERVER_UNREACHABLE' ||
    rawCode === 'INVALID_JSON_RESPONSE' ||
    status === 502 ||
    status === 503 ||
    rawMsg.includes('Failed to fetch') ||
    rawMsg.includes('NetworkError') ||
    rawMsg.includes('<!DOCTYPE') ||
    rawMsg.includes('<!doctype') ||
    rawMsg.includes('Unexpected token') ||
    rawMsg.includes('is not valid JSON')
  ) {
    return {
      message: "The server isn't reachable right now. Please try again in a moment.",
      code: 'REG-NET-01',
      fullText: "The server isn't reachable right now. Please try again in a moment. [REG-NET-01]"
    };
  }

  // 11. Missing consent
  if (rawCode === 'CONSENT_REQUIRED' || rawMsg.includes('Consent to Terms') || rawMsg.includes('consent is required')) {
    return {
      message: 'Consent to Terms and Data Privacy Act is required.',
      code: 'REG-CON-01',
      fullText: 'Consent to Terms and Data Privacy Act is required. [REG-CON-01]'
    };
  }

  // 12. General Firebase or auth failure
  if (rawCode.startsWith('auth/') || rawMsg.includes('Firebase') || rawMsg.includes('credential')) {
    return {
      message: 'Authentication service is currently unavailable. Please check your connection and try again.',
      code: 'REG-FB-01',
      fullText: 'Authentication service is currently unavailable. Please check your connection and try again. [REG-FB-01]'
    };
  }

  return {
    message: rawMsg || 'Unable to complete registration. Please try again in a moment.',
    code: 'REG-GEN-01',
    fullText: `${rawMsg || 'Unable to complete registration. Please try again in a moment.'} [REG-GEN-01]`
  };
}

/**
 * Maps API and network errors to clear, friendly user messages based on status codes.
 */
export function getFriendlyErrorMessage(err: any): string {
  const regErr = getRegistrationErrorMessage(err);
  if (regErr.code !== 'REG-GEN-01') {
    return regErr.fullText;
  }

  const status = err?.status || err?.response?.status;
  const code = err?.code || err?.response?.data?.code;
  const message = err?.message || err?.response?.data?.error || '';

  if (
    status === 401 ||
    code === 'AUTH_TOKEN_INVALID' ||
    message.includes('no "kid" claim') ||
    message.includes('Firebase ID token') ||
    message.includes('firebase.google.com/docs') ||
    message.includes('id-token-expired') ||
    message.includes('id-token-revoked')
  ) {
    return 'Your session has expired. Please sign in again.';
  }
  if (
    code === 'TIMEOUT' ||
    message.includes('signal timed out') ||
    message.includes('TimeoutError') ||
    message.includes('timed out')
  ) {
    return 'The request took too long to complete. Please try again in a moment. [NET-TIMEOUT]';
  }
  if (
    code === 'SERVER_UNREACHABLE' ||
    code === 'INVALID_JSON_RESPONSE' ||
    code === 'INVALID_IMAGE_RESPONSE' ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Unexpected token') ||
    message.includes('is not valid JSON') ||
    message.includes('JSON.parse') ||
    message.includes('<!DOCTYPE') ||
    message.includes('<!doctype')
  ) {
    return "The server isn't reachable right now. Please try again in a moment. [NET-01]";
  }
  if (code === 'OUTSIDE_SERVICE_AREA' || message.includes('Angeles City')) {
    return 'Sorry, we only deliver within Angeles City, Pampanga.';
  }
  if (code === 'COORDINATES_REQUIRED') {
    return 'Please update the app or refresh the page to choose your delivery location on the map.';
  }
  if (code === 'auth/email-already-in-use' || message.includes('email-already-in-use')) {
    return 'An account with this email address already exists. Please log in instead.';
  }
  if (code === 'auth/weak-password' || message.includes('weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
    return 'Network connection problem with authentication service. Please check your connection.';
  }
  if (code === 'PICKUP_REQUIRES_EWALLET') {
    return 'Station pickup orders require E-Wallet payment (GCash / Maya). Cash is available for Delivery only.';
  }
  if (code === 'UNPAID_ORDER_LIMIT') {
    return message || 'You have reached the maximum number of simultaneous unpaid pending orders. Please pay or cancel an existing order first.';
  }
  if (code === 'ORDER_NOT_CANCELLABLE') {
    return message || 'This order can no longer be cancelled because it is already being processed.';
  }
  if (code === 'PAYMENT_ALREADY_SUBMITTED') {
    return message || 'Contact the station to cancel this order after payment proof has been submitted or verified.';
  }
  if (code === 'ALREADY_CANCELLED') {
    return 'This order has already been cancelled.';
  }
  if (status === 429 || code === 'CANCEL_RATE_LIMITED') {
    return 'Too many requests right now. Please wait a few minutes before trying again.';
  }
  if (
    status === 409 ||
    code === 'PAYMENT_NOT_VERIFIED' ||
    message.includes('Unverified QR') ||
    message.includes('cannot enter fulfillment')
  ) {
    return 'Payment must be verified before fulfilling this order.';
  }
  if (status === 403 || code === 'FORBIDDEN') {
    return 'You do not have permission to perform this action.';
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return 'Order not found or has been removed.';
  }
  if (status === 503 || code === 'DATABASE_UNAVAILABLE') {
    return 'Service temporarily unavailable. Please try again in a moment.';
  }
  if (status === 422) {
    return message || 'Invalid data submitted.';
  }
  return message || 'An unexpected error occurred while updating the order.';
}

/**
 * Shared single definition of a "Pending Order" used across the Dashboard
 * tile, Navbar notification bell, and Orders page Pending filter.
 */
export function isOrderPending(order: {
  status?: string | null;
  orderStatus?: string | null;
}): boolean {
  const status = (order?.status || order?.orderStatus || '').toString().toUpperCase();
  return status === 'PENDING';
}

/**
 * Summarizes order line items concisely for compact pending-order cards.
 * e.g. "Mineral Refill × 2" or "Mineral Refill × 2, +1 more"
 */
export function formatPendingOrderItemsSummary(
  items?: Array<{ product_name?: string; qty?: number; quantity?: number; product?: { name?: string } }> | null
): string {
  if (!items || items.length === 0) return 'Water order';
  const first = items[0];
  const firstName = first.product_name || first.product?.name || 'Water item';
  const firstQty = Number(first.qty ?? first.quantity ?? 1);
  const base = `${firstName} × ${firstQty}`;
  if (items.length === 1) return base;
  return `${base}, +${items.length - 1} more`;
}

/**
 * Full Asia/Manila timestamp for accessible tooltips.
 */
export function formatManilaTimestamp(dateInput: string | Date): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getManilaDayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/**
 * Relative timestamp anchored to Asia/Manila calendar days near midnight.
 */
export function formatManilaRelativeTime(dateInput: string | Date, nowMs: number = Date.now()): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Math.max(0, nowMs - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const nowDate = new Date(nowMs);
  const orderDay = getManilaDayKey(date);
  const currentDay = getManilaDayKey(nowDate);
  if (orderDay === currentDay) {
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr} hr ago`;
  }

  const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
  const timePart = date.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit'
  });
  if (orderDay === getManilaDayKey(yesterday)) {
    return `Yesterday, ${timePart}`;
  }

  const datePart = date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric'
  });
  return `${datePart}, ${timePart}`;
}

export type PendingPaymentTone = 'cash' | 'awaiting' | 'submitted' | 'rejected' | 'verified';

/**
 * Concise, human-readable payment chip label for pending order cards (zero raw enums).
 */
export function getPendingPaymentChip(
  method?: string | null,
  status?: string | null
): { label: string; tone: PendingPaymentTone } {
  const cleanMethod = (method || '').toUpperCase();
  const cleanStatus = (status || '').toUpperCase();

  if (cleanMethod === 'CASH') {
    return { label: 'Cash', tone: 'cash' };
  }
  if (cleanStatus === 'SUBMITTED') {
    return { label: 'Proof submitted – verify', tone: 'submitted' };
  }
  if (cleanStatus === 'REJECTED') {
    return { label: 'Payment rejected', tone: 'rejected' };
  }
  if (cleanStatus === 'VERIFIED' || cleanStatus === 'COMPLETED') {
    return { label: 'Payment verified', tone: 'verified' };
  }
  return { label: 'Awaiting payment', tone: 'awaiting' };
}
