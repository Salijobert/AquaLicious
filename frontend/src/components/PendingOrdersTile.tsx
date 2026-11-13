import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, RefreshCw, AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react';
import { usePendingOrdersSummary } from '../api/client.js';
import {
  formatFulfillment,
  formatManilaRelativeTime,
  formatManilaTimestamp,
  formatPendingOrderItemsSummary,
  getPendingPaymentChip,
  PendingPaymentTone
} from '../utils/orderLabels.js';
import { formatPeso } from '../utils/currency.js';

const CHIP_TONE_CLASSES: Record<PendingPaymentTone, string> = {
  cash: 'bg-amber-50 text-amber-800 border-amber-200',
  awaiting: 'bg-slate-100 text-slate-700 border-slate-300',
  submitted: 'bg-blue-50 text-[#0b3d91] border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  verified: 'bg-emerald-50 text-emerald-800 border-emerald-200'
};

export const PendingOrdersTile: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = usePendingOrdersSummary(5, true);

  const count = data?.count ?? 0;
  const orders = data?.orders ?? [];

  return (
    <section
      aria-labelledby="pending-orders-tile-heading"
      className="w-full min-w-0 max-w-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 px-4 sm:px-5 py-3.5 sm:py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1565c0] flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="pending-orders-tile-heading"
              className="text-base font-bold text-[#0b3d91] m-0"
            >
              Pending Orders
            </h2>
            <span
              data-testid="pending-orders-count"
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                count > 0
                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isLoading ? '…' : count}
            </span>
          </div>
        </div>

        <Link
          to="/orders?filter=pending"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1565c0] hover:text-[#0b3d91] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565c0] rounded px-1.5 py-1"
        >
          <span>View all orders</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="min-w-0">
        {isLoading ? (
          <div className="divide-y divide-slate-100 p-4 space-y-3" aria-label="Loading pending orders">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="pt-3 first:pt-0 animate-pulse flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="h-3.5 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
                <div className="h-6 bg-slate-200 rounded-full w-24 shrink-0" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center space-y-3" role="alert">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">Unable to load pending orders</p>
              <p className="text-xs text-slate-600">Check your connection and try refreshing.</p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="btn btn-outline btn-sm inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Retry</span>
            </button>
          </div>
        ) : count === 0 || orders.length === 0 ? (
          <div className="p-6 text-center space-y-1.5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              No pending orders. You&apos;re all caught up.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.slice(0, 5).map((order) => {
              const paymentChip = getPendingPaymentChip(order.payment_method, order.payment_status);
              const itemsText = formatPendingOrderItemsSummary(order.items_summary);
              const relTime = formatManilaRelativeTime(order.created_at);
              const fullTime = formatManilaTimestamp(order.created_at);

              return (
                <li key={order.id}>
                  <Link
                    to={`/orders?filter=pending&orderId=${order.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-5 py-3.5 hover:bg-blue-50/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1565c0]"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-extrabold text-[#1565c0]">
                          #{order.order_number}
                        </span>
                        <span className="text-sm font-bold text-slate-900 truncate max-w-[220px]">
                          {order.customer_name || 'Walk-in customer'}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"
                          title={fullTime}
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{relTime}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                        <span className="truncate max-w-[260px]" title={itemsText}>
                          {itemsText}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-bold text-slate-900">
                          {formatPeso(order.total)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap sm:justify-end shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {formatFulfillment(order.fulfillment)}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${CHIP_TONE_CLASSES[paymentChip.tone]}`}
                      >
                        {paymentChip.label}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
