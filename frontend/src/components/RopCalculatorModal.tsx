import React, { useState } from 'react';
import { Calculator, X } from 'lucide-react';

interface RopCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RopCalculatorModal: React.FC<RopCalculatorModalProps> = ({ isOpen, onClose }) => {
  const [usage, setUsage] = useState('');
  const [lead, setLead] = useState('');
  const [safety, setSafety] = useState('');
  const [stock, setStock] = useState('');
  const [result, setResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    const u = Number(usage) || 0;
    const l = Number(lead) || 0;
    const s = Number(safety) || 0;
    const curStock = Number(stock) || 0;

    const rop = Math.ceil(u * l + s);
    let status = 'Normal';
    if (curStock <= rop) {
      status = 'Critical';
    } else if (curStock < Math.ceil(1.5 * rop)) {
      status = 'Warning';
    }

    setResult(`${rop} units · ${status}`);
  };

  return (
    <dialog open className="modal modal-open z-50">
      <div className="modal-box bg-white text-slate-800 max-w-md p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold text-primary">ROP Formula Calculator</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Calculate Reorder Point: <code className="bg-slate-100 px-1 py-0.5 rounded font-bold">ROP = (Daily Usage × Lead Time) + Safety Stock</code>
        </p>

        <form id="rop-form" onSubmit={handleCalculate} className="space-y-3">
          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Average Daily Usage (units/day)</label>
            <input
              type="number"
              name="usage"
              required
              min="0"
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. 50"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Lead Time (days)</label>
            <input
              type="number"
              name="lead"
              required
              min="0"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. 2"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Safety Stock (units)</label>
            <input
              type="number"
              name="safety"
              required
              min="0"
              value={safety}
              onChange={(e) => setSafety(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. 30"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Current Stock (units)</label>
            <input
              type="number"
              name="stock"
              required
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. 120"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-sm w-full mt-4 font-bold">
            Calculate Threshold
          </button>
        </form>

        {result && (
          <div className="mt-4 p-3 bg-slate-100 rounded-lg text-center border">
            <div className="text-xs text-slate-500 font-semibold uppercase">Computed Reorder Threshold</div>
            <div id="rop-result" className="text-lg font-black text-primary mt-1">
              {result}
            </div>
          </div>
        )}

        <div className="modal-action mt-4">
          <button type="button" onClick={onClose} className="dialog-close btn btn-ghost btn-sm w-full">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
