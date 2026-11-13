import React from 'react';
import { Droplet, Printer } from 'lucide-react';
import { Modal } from './Modal.js';
import { formatPeso } from '../utils/currency.js';

interface ReceiptModalProps {
  receipt: any;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  return (
    <Modal
      isOpen={Boolean(receipt)}
      onClose={onClose}
      size="md"
      closeAriaLabel="Close receipt modal"
      icon={<Droplet className="w-6 h-6 text-[#1565c0] fill-[#1565c0]" />}
      title={receipt ? `Receipt #${receipt.order_number}` : 'Receipt'}
      subtitle="Water Refilling Station & POS"
      footer={
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-outline btn-sm gap-2"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close btn btn-primary btn-sm px-6"
          >
            Done
          </button>
        </div>
      }
    >
      {receipt && (
        <>
          <div className="receipt text-center border-b border-slate-200 pb-4 mb-4">
            <div className="flex justify-center items-center gap-2 mb-1">
              <Droplet className="w-7 h-7 text-secondary fill-secondary" />
              <h3 className="text-xl font-black text-primary tracking-wider">AQUALICIOUS</h3>
            </div>
            <p className="text-xs text-slate-500 uppercase">Water Refilling Station &amp; POS</p>
            <p className="text-xs text-slate-500 mt-1">Receipt #{receipt.order_number}</p>
            <div className="mt-1 text-xs font-semibold text-slate-700">
              Customer: {receipt.customer || receipt.user?.name || 'Walk-in customer'}
            </div>
            <div className="text-xs text-slate-600">
              Mode of Payment: {(receipt.payment_method === 'CASH' || receipt.payment?.method === 'CASH') ? 'Cash' : 'E-Wallet'}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {new Date(receipt.created_at || Date.now()).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2 mb-4 text-sm">
            <div className="flex justify-between font-bold text-xs uppercase border-b pb-1 text-slate-500">
              <span>Item</span>
              <span>Qty × Price</span>
              <span>Total</span>
            </div>
            {receipt.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <div className="truncate max-w-[160px]">
                  <div className="font-semibold text-slate-800">{item.product_name}</div>
                  <div className="text-[10px] text-slate-500">{item.sku}</div>
                </div>
                <div className="text-slate-600">
                  {item.qty} × {formatPeso(item.unit_price)}
                </div>
                <div className="font-bold text-slate-900">
                  {formatPeso(item.subtotal)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals & Change */}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between font-bold text-base text-slate-900">
              <span>Total Amount:</span>
              <span className="text-primary">{formatPeso(receipt.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Cash Tendered:</span>
              <span>{formatPeso(receipt.cash_tendered || receipt.total)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-emerald-700 border-t pt-1">
              <span>Change: {formatPeso(receipt.change_due || 0)}</span>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
};
