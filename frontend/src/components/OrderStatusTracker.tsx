import React from 'react';
import { Check, Clock, Truck, Package, XCircle, AlertCircle } from 'lucide-react';
import { formatPeso } from '../utils/currency.js';
import { formatOrderStatus, formatPaymentStatus } from '../utils/orderLabels.js';

export type FulfillmentType = 'PICKUP' | 'DELIVERY' | 'WALK_IN_POS' | string;

export interface OrderStatusTrackerProps {
  order: {
    id?: number;
    order_number?: string;
    orderNumber?: string;
    status: string;
    fulfillment?: FulfillmentType;
    orderType?: FulfillmentType;
    order_type?: FulfillmentType;
    payment_method?: string;
    payment_status?: string;
    payment?: {
      method?: string;
      status?: string;
      notes?: string | null;
      rejection_reason?: string | null;
    };
    rejection_reason?: string | null;
    notes?: string | null;
    cancel_reason?: string | null;
    total?: number | string;
    total_amount?: number | string;
    totalAmount?: number | string;
  };
  compact?: boolean;
  className?: string;
}

export interface StepDefinition {
  key: string;
  label: string;
  stepNumber: number;
}

/**
 * Returns canonical steps based on order fulfillment type.
 * DELIVERY: Placed -> Processing -> Out for Delivery -> Done
 * PICKUP:   Placed -> Processing -> Ready for Pickup -> Done
 */
export function getTrackerSteps(fulfillment: FulfillmentType): StepDefinition[] {
  const norm = String(fulfillment || '').toUpperCase();
  const isDelivery = norm === 'DELIVERY';

  return [
    { key: 'PENDING', label: 'Placed', stepNumber: 1 },
    { key: 'PREPARING', label: 'Processing', stepNumber: 2 },
    { key: isDelivery ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP', label: isDelivery ? 'Out for Delivery' : 'Ready for Pickup', stepNumber: 3 },
    { key: 'COMPLETED', label: 'Done', stepNumber: 4 }
  ];
}

/**
 * Computes which step index (1-4) is currently active, or returns 0 for CANCELLED/VOIDED.
 * Safely handles out-of-order or cross-fulfillment transitions without crashing.
 */
export function getActiveStepIndex(status: string, fulfillment: FulfillmentType): number {
  const normStatus = String(status || '').toUpperCase().trim();
  const normFulfillment = String(fulfillment || '').toUpperCase().trim();
  const isDelivery = normFulfillment === 'DELIVERY';

  if (normStatus === 'CANCELLED' || normStatus === 'VOIDED') {
    return 0; // Cancelled state
  }

  if (normStatus === 'COMPLETED') {
    return 4; // All steps done
  }

  if (normStatus === 'OUT_FOR_DELIVERY') {
    return 3;
  }

  if (normStatus === 'READY_FOR_PICKUP') {
    return 3;
  }

  if (normStatus === 'PREPARING' || normStatus === 'ACCEPTED' || normStatus === 'CONFIRMED') {
    return 2;
  }

  if (normStatus === 'PENDING') {
    return 1;
  }

  return 1;
}

export const OrderStatusTracker: React.FC<OrderStatusTrackerProps> = ({
  order,
  compact = false,
  className = ''
}) => {
  const rawStatus = order.status || (order as any).orderStatus || 'PENDING';
  const rawFulfillment = order.fulfillment || order.orderType || order.order_type || 'PICKUP';
  const steps = getTrackerSteps(rawFulfillment);
  const activeStep = getActiveStepIndex(rawStatus, rawFulfillment);
  const isCancelled = activeStep === 0;
  const isVoided = String(rawStatus).toUpperCase() === 'VOIDED';

  const paymentStatus = order.payment_status || order.payment?.status || 'PENDING';
  const paymentMethod = order.payment_method || order.payment?.method || 'CASH';
  const isEWallet = paymentMethod === 'E_WALLET' || paymentMethod === 'GCASH_QR' || paymentMethod === 'MAYA_QR';
  const isDelivery = String(rawFulfillment).toUpperCase() === 'DELIVERY';
  const rejectionReason = order.rejection_reason || order.payment?.rejection_reason || order.notes || order.payment?.notes;

  return (
    <div className={`order-status-tracker ${className}`}>
      {isCancelled ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 flex items-start gap-2.5">
          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-bold">{isVoided ? 'Order Voided' : 'Order Cancelled'}</div>
            <div className="text-[11px] text-red-700 mt-0.5">
              {order.cancel_reason || (isVoided ? 'This transaction was voided and refunded.' : 'This order was cancelled and will not be fulfilled.')}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Step Labels */}
          <div className="grid grid-cols-4 gap-1 text-center text-[10px] sm:text-xs font-bold">
            {steps.map((step, idx) => {
              const stepNum = idx + 1;
              const isPassed = activeStep > stepNum;
              const isCurrent = activeStep === stepNum;
              const isDone = activeStep === 4;

              let textColor = 'text-slate-400';
              if (isDone) {
                textColor = 'text-[#2e7d32]';
              } else if (isPassed || isCurrent) {
                textColor = 'text-[#1565c0]';
              }

              return (
                <div key={step.key} className={`${textColor} truncate px-0.5`} title={step.label}>
                  {step.label}
                </div>
              );
            })}
          </div>

          {/* Step Progress Bar */}
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex relative">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                activeStep === 4 ? 'bg-[#2e7d32]' : 'bg-[#1565c0]'
              }`}
              style={{
                width:
                  activeStep === 4
                    ? '100%'
                    : activeStep === 3
                    ? '75%'
                    : activeStep === 2
                    ? '50%'
                    : '25%'
              }}
            />
          </div>

          {/* Payment Gating / Note for E-Wallet or Delivery orders awaiting payment */}
          {(isEWallet || (isDelivery && paymentStatus === 'PENDING')) && activeStep < 4 && (
            <div className="pt-1">
              {paymentStatus === 'REJECTED' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                  <span>Payment rejected{rejectionReason ? `: ${rejectionReason}` : ''}</span>
                </div>
              ) : paymentStatus === 'SUBMITTED' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1565c0] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-[#1565c0]" />
                  <span>Proof submitted, waiting for verification</span>
                </div>
              ) : paymentStatus === 'PENDING' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Awaiting payment</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderStatusTracker;
