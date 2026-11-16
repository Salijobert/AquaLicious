import React from 'react';
import { Droplet, Printer, Download, MapPin, Phone, Mail } from 'lucide-react';
import { Modal } from './Modal.js';
import { formatPeso } from '../utils/currency.js';
import { COPY } from '../constants/copy.js';
import { isCapacitorApp } from '../utils/platform.js';

export interface ReceiptItem {
  product_name: string;
  sku?: string;
  qty: number;
  unit_price: number | string;
  subtotal: number | string;
}

export interface ReceiptData {
  order_number: string;
  created_at: string;
  customer?: string;
  customer_name?: string;
  fulfillment?: 'PICKUP' | 'DELIVERY' | string;
  address?: string | null;
  payment_method?: string;
  payment_status?: string;
  reference_number?: string | null;
  items: ReceiptItem[];
  total: number | string;
  cash_tendered?: number | string | null;
  change_due?: number | string | null;
}

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const isCapacitor = isCapacitorApp();

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleSavePdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (!receipt) return null;

  const dateFormatted = new Date(receipt.created_at || Date.now()).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const isDelivery = String(receipt.fulfillment || '').toUpperCase() === 'DELIVERY';
  const isCash = String(receipt.payment_method || '').toUpperCase() === 'CASH';

  return (
    <Modal
      isOpen={Boolean(receipt)}
      onClose={onClose}
      size="md"
      closeAriaLabel="Close receipt modal"
      icon={<Droplet className="w-6 h-6 text-[#1565c0] fill-[#1565c0]" />}
      title={`Order Receipt #${receipt.order_number}`}
      subtitle="Plain System-Generated Order Receipt"
      footer={
        <div className="flex justify-between items-center w-full no-print">
          <div className="flex gap-2">
            {!isCapacitor && (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn btn-outline btn-sm gap-1.5 text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={handleSavePdf}
                  className="btn btn-outline btn-sm gap-1.5 text-xs font-bold hidden sm:inline-flex"
                >
                  <Download className="w-3.5 h-3.5" /> Save as PDF
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary btn-sm px-6 text-xs font-bold text-white rounded-xl"
          >
            Done
          </button>
        </div>
      }
    >
      <div id="receipt-printable-area" className="p-4 sm:p-5 bg-white text-slate-800 font-sans space-y-4">
        {/* Header */}
        <div className="text-center border-b border-dashed border-slate-300 pb-3">
          <div className="flex justify-center items-center gap-1.5 mb-1">
            <Droplet className="w-6 h-6 text-[#1565c0] fill-[#1565c0]" />
            <h2 className="font-serif text-xl font-black text-[#0b3d91] tracking-wider">
              AQUALICIOUS
            </h2>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Water Refilling Station &amp; Delivery
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Angeles City, Pampanga · Customer Support: {COPY.ABOUT.PHONE}
          </p>
          <div className="text-xs font-mono font-bold text-slate-900 mt-2">
            Order Receipt #{receipt.order_number}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {dateFormatted}
          </div>
        </div>

        {/* Customer & Fulfillment Info */}
        <div className="text-xs space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Customer:</span>
            <span className="font-bold text-slate-900">{receipt.customer_name || receipt.customer || 'Walk-in customer'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Fulfillment:</span>
            <span className="font-semibold text-slate-800">
              {isDelivery ? 'Station Delivery' : 'Pickup at Station'}
            </span>
          </div>
          {isDelivery && receipt.address && (
            <div className="flex justify-between items-start pt-0.5">
              <span className="text-slate-500 font-medium shrink-0 mr-2">Address:</span>
              <span className="font-normal text-slate-700 text-right text-[11px] break-words">
                {receipt.address}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-0.5">
            <span className="text-slate-500 font-medium">Payment:</span>
            <span className="font-semibold text-slate-800">
              {isCash ? 'Cash on Delivery' : 'E-Wallet (GCash / Maya)'}
            </span>
          </div>
          {receipt.reference_number && (
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-500 font-sans">Ref No.:</span>
              <span className="font-bold text-slate-800">{receipt.reference_number}</span>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="space-y-1.5 border-t border-b border-dashed border-slate-300 py-3 text-xs">
          <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500 border-b border-slate-100 pb-1">
            <span className="flex-1">Item</span>
            <span className="w-16 text-center">Qty × Price</span>
            <span className="w-16 text-right">Subtotal</span>
          </div>
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-xs py-0.5">
              <div className="flex-1 pr-2">
                <div className="font-semibold text-slate-900">{item.product_name}</div>
                {item.sku && <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>}
              </div>
              <div className="w-16 text-center text-slate-600 text-[11px]">
                {item.qty} × {formatPeso(item.unit_price)}
              </div>
              <div className="w-16 text-right font-bold text-slate-900">
                {formatPeso(item.subtotal)}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="space-y-1 text-xs pt-1">
          <div className="flex justify-between font-bold text-sm text-slate-900">
            <span>Total Amount:</span>
            <span className="text-[#0b3d91]">{formatPeso(receipt.total)}</span>
          </div>
          {receipt.cash_tendered !== undefined && receipt.cash_tendered !== null && (
            <>
              <div className="flex justify-between text-slate-600 text-[11px]">
                <span>Cash Tendered:</span>
                <span>{formatPeso(receipt.cash_tendered)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700 text-xs border-t border-slate-100 pt-1">
                <span>Change:</span>
                <span>{formatPeso(receipt.change_due || 0)}</span>
              </div>
            </>
          )}
        </div>

        {/* Receipt Footer */}
        <div className="pt-3 border-t border-dashed border-slate-300 text-center">
          <p className="text-[9px] text-slate-400">
            AquaLicious Academic Project · Angeles City, Pampanga
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ReceiptModal;
