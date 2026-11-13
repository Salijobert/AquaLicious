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
 * Maps API and network errors to clear, friendly user messages based on status codes.
 */
export function getFriendlyErrorMessage(err: any): string {
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
    code === 'SERVER_UNREACHABLE' ||
    code === 'INVALID_JSON_RESPONSE' ||
    code === 'INVALID_IMAGE_RESPONSE' ||
    message.includes('Unexpected token') ||
    message.includes('is not valid JSON') ||
    message.includes('JSON.parse') ||
    message.includes('<!DOCTYPE') ||
    message.includes('<!doctype')
  ) {
    return "The server isn't reachable right now. Please try again in a moment.";
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
