import React from 'react';
import { Droplet, Printer, CheckCircle } from 'lucide-react';

interface ReceiptModalProps {
  receipt: any;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  return (
    <dialog open className="modal modal-open z-50">
      <div className="modal-box max-w-md bg-white text-slate-800 p-6 shadow-2xl rounded-2xl border border-slate-200">
        <div className="receipt text-center border-b pb-4 mb-4">
          <div className="flex justify-center items-center gap-2 mb-1">
            <Droplet className="w-8 h-8 text-secondary fill-secondary" />
            <h2 className="text-2xl font-black text-primary tracking-wider">AQUALICIOUS</h2>
          </div>
          <p className="text-xs text-slate-500 uppercase">Water Refilling Station & POS</p>
          <p className="text-xs text-slate-400 mt-1">Receipt #{receipt.order_number}</p>
          <div className="mt-1 text-xs font-semibold text-slate-600">
            Customer: {receipt.customer || receipt.user?.name || 'Walk-in customer'}
          </div>
          <div className="text-xs text-slate-500">
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
                <div className="text-[10px] text-slate-400">{item.sku}</div>
              </div>
              <div className="text-slate-500">
                {item.qty} × ₱{Number(item.unit_price).toFixed(2)}
              </div>
              <div className="font-bold text-slate-800">
                ₱{Number(item.subtotal).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Change */}
        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between font-bold text-base">
            <span>Total Amount:</span>
            <span className="text-primary">₱{Number(receipt.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>Cash Tendered:</span>
            <span>₱{Number(receipt.cash_tendered || receipt.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-black text-emerald-600 border-t pt-1">
            <span>Change: ₱{Number(receipt.change_due || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="modal-action mt-6 flex justify-between items-center">
          <button
            onClick={() => window.print()}
            className="btn btn-outline btn-sm gap-2"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={onClose}
            className="dialog-close btn btn-primary btn-sm px-6"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
};
