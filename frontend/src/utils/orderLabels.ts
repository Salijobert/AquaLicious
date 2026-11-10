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
      return 'Payment Verified';
    case 'REJECTED':
      return 'Payment Rejected';
    case 'COMPLETED':
      return 'Payment Completed';
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
export function getAllowedOrderActions(order: {
  status?: string | null;
  orderStatus?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  payment?: { method?: string; status?: string };
  fulfillment?: string | null;
  allowed_actions?: string[];
}): string[] {
  if (Array.isArray(order.allowed_actions)) {
    return order.allowed_actions;
  }

  const orderStatus = (order.status || order.orderStatus || 'PENDING').toUpperCase();
  const paymentMethod = (order.payment_method || order.payment?.method || 'CASH').toUpperCase();
  const paymentStatus = (order.payment_status || order.payment?.status || 'PENDING').toUpperCase();
  const fulfillment = (order.fulfillment || 'PICKUP').toUpperCase();

  if (orderStatus === 'COMPLETED' || orderStatus === 'CANCELLED') {
    return [];
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

/**
 * Maps API and network errors to clear, friendly user messages based on status codes.
 */
export function getFriendlyErrorMessage(err: any): string {
  const status = err?.status || err?.response?.status;
  const code = err?.code || err?.response?.data?.code;
  const message = err?.message || err?.response?.data?.error || '';

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
