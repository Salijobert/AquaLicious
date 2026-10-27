import React from 'react';

/**
 * 1. Immutable Stock Movement Ledger Skeleton Row (6 columns)
 * Columns: Date & Time, Product, Movement Type, Delta, Prev → New, Notes
 */
export const LedgerSkeletonRow: React.FC = () => {
  return (
    <tr className="animate-pulse bg-white/70 border-b border-gray-100">
      <td className="py-3 px-4">
        <div className="h-4 w-28 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-32 bg-slate-200 rounded-md" />
        <div className="h-2.5 w-16 bg-slate-100 rounded-sm mt-1" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-20 bg-slate-200 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-10 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-16 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-36 bg-slate-100 rounded-md" />
      </td>
    </tr>
  );
};

/**
 * 2. Full Daily Revenue Series Skeleton Row (5 columns)
 * Columns: Date, Transactions, Revenue (₱), Gross Margin (₱), Average / Sale
 */
export const RevenueSkeletonRow: React.FC = () => {
  return (
    <tr className="animate-pulse bg-white/70 border-b border-gray-100">
      <td className="py-3 px-4">
        <div className="h-4 w-24 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-8 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-20 bg-slate-200 rounded-md font-bold" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-20 bg-emerald-100/70 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-16 bg-slate-100 rounded-md" />
      </td>
    </tr>
  );
};

/**
 * 3. User Management Skeleton Row (6 columns)
 * Columns: User / Name, Username, Role, Status, Created, Action
 */
export const UserSkeletonRow: React.FC = () => {
  return (
    <tr className="animate-pulse bg-white/70 border-b border-gray-100">
      <td className="py-3 px-4">
        <div className="h-4 w-28 bg-slate-200 rounded-md" />
        <div className="h-2.5 w-12 bg-slate-100 rounded-sm mt-1" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-24 bg-slate-200 rounded-md font-mono" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-24 bg-blue-100/70 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-16 bg-emerald-100/70 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-20 bg-slate-100 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-6 w-16 bg-slate-200 rounded-lg" />
      </td>
    </tr>
  );
};

/**
 * 4. Walk-in POS Sales History Skeleton Row (6 columns)
 * Columns: Order #, Cashier / User, Total, Status, Date & Time, Action
 */
export const SalesHistorySkeletonRow: React.FC = () => {
  return (
    <tr className="animate-pulse bg-white/70 border-b border-gray-100">
      <td className="py-3 px-4">
        <div className="h-4 w-28 bg-blue-100/80 rounded-md font-mono" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-20 bg-slate-200 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-16 bg-slate-200 rounded-md font-bold" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-16 bg-emerald-100/70 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-28 bg-slate-100 rounded-md" />
      </td>
      <td className="py-3 px-4">
        <div className="h-6 w-12 bg-red-100/70 rounded-lg" />
      </td>
    </tr>
  );
};

/**
 * 5. Orders Card Skeleton (Matching OrdersPage card layout)
 */
export const OrderCardSkeleton: React.FC = () => {
  return (
    <div className="order card bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-4 animate-pulse">
      <div className="space-y-3 flex-1">
        {/* Header Badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-5 w-28 bg-blue-100 rounded-md" />
          <div className="h-5 w-20 bg-amber-100 rounded-full" />
          <div className="h-5 w-24 bg-sky-100 rounded-full" />
          <div className="h-3 w-28 bg-slate-200 rounded-md" />
        </div>

        {/* Customer & Address Details */}
        <div className="space-y-2">
          <div className="h-3.5 w-48 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-64 bg-slate-100 rounded-md" />
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-32 bg-slate-100 rounded-md" />
            <div className="h-5 w-24 bg-slate-100 rounded-md" />
          </div>
        </div>

        {/* Payment Box */}
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center">
          <div className="h-3.5 w-32 bg-slate-200 rounded-md" />
          <div className="h-4 w-20 bg-slate-200 rounded-full" />
        </div>
      </div>

      {/* Price & Action Area */}
      <div className="flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5 min-w-[200px]">
        <div className="text-right w-full space-y-1">
          <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
          <div className="h-7 w-28 bg-blue-200/80 rounded-md ml-auto" />
        </div>

        <div className="w-full mt-4">
          <div className="h-7 w-full bg-slate-200 rounded-lg" />
        </div>
      </div>
    </div>
  );
};
