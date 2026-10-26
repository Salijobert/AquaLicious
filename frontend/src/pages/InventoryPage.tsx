import React, { useState } from 'react';
import { useInventory, useAdjustStock } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Boxes, Calculator, PlusCircle, History, AlertCircle } from 'lucide-react';
import { RopCalculatorModal } from '../components/RopCalculatorModal.js';

export const InventoryPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const { data: inventory, isLoading } = useInventory();
  const { data: ledger } = useInventory(true);
  const adjustStockMutation = useAdjustStock();

  const [isRopOpen, setIsRopOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [adjustType, setAdjustType] = useState<'RESTOCK' | 'ADJUSTMENT'>('RESTOCK');
  const [adjustQty, setAdjustQty] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setError(null);

    try {
      await adjustStockMutation.mutateAsync({
        product_id: selectedProduct.id,
        type: adjustType,
        quantity: Number(adjustQty),
        notes
      });
      setSelectedProduct(null);
      setAdjustQty('');
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Inventory adjustment failed');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error || ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Inventory Monitoring</h1>
          <p className="text-xs text-slate-500 font-semibold">Stock Levels, Usage Analytics & Reorder Thresholds</p>
        </div>

        <button
          data-action="rop"
          onClick={() => setIsRopOpen(true)}
          className="btn btn-secondary btn-sm gap-2 text-primary font-bold shadow"
        >
          <Calculator className="w-4 h-4" /> ROP Calculator
        </button>
      </div>

      {/* Stock Levels Table */}
      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Boxes className="w-5 h-5 text-primary" /> Active Stock Balances
        </h2>

        <div className="overflow-x-auto">
          <table className="table table-sm text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th>Product</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>7-Day Sold</th>
                <th>Effective ROP</th>
                <th>Status</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {inventory?.map((p: any) => (
                <tr key={p.id} className="hover">
                  <td className="font-bold text-slate-800">
                    <div>{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{p.sku}</div>
                  </td>
                  <td>{p.category}</td>
                  <td className="font-black text-sm text-slate-900">{p.stock} units</td>
                  <td className="text-slate-500">{p.seven_day_usage} units</td>
                  <td className="font-semibold text-slate-700">{p.effective_rop} units</td>
                  <td>
                    <span
                      className={`badge badge-sm font-bold ${
                        p.status === 'Critical'
                          ? 'badge-error text-white'
                          : p.status === 'Warning'
                          ? 'badge-warning text-slate-900'
                          : 'badge-success text-white'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <button
                        onClick={() => setSelectedProduct(p)}
                        className="btn btn-primary btn-xs gap-1 font-bold"
                      >
                        <PlusCircle className="w-3 h-3" /> Adjust
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable Stock Movement Ledger */}
      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-secondary" /> Immutable Stock Movement Ledger
        </h2>

        <div className="overflow-x-auto max-h-[350px]">
          <table className="table table-sm text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700">
              <tr>
                <th>Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Change</th>
                <th>Balance (Prev → New)</th>
                <th>Actor</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.map((m: any) => (
                <tr key={m.id} className="hover">
                  <td className="text-slate-400 text-[11px] whitespace-nowrap">
                    {new Date(m.logged_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                  </td>
                  <td className="font-bold">{m.product_name}</td>
                  <td>
                    <span className="badge badge-outline badge-xs font-semibold">{m.movement_type}</span>
                  </td>
                  <td className={`font-bold ${m.change_qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.change_qty > 0 ? `+${m.change_qty}` : m.change_qty}
                  </td>
                  <td className="font-mono text-slate-600">
                    {m.previous_balance} → {m.new_balance}
                  </td>
                  <td className="text-slate-500">{m.user_name}</td>
                  <td className="text-slate-400 truncate max-w-[200px]">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RopCalculatorModal isOpen={isRopOpen} onClose={() => setIsRopOpen(false)} />

      {/* Adjustment Dialog */}
      {selectedProduct && (
        <dialog open className="modal modal-open z-50">
          <div className="modal-box bg-white text-slate-800 max-w-sm p-6 rounded-2xl shadow-2xl">
            <h3 className="font-bold text-lg text-primary mb-2">Adjust {selectedProduct.name}</h3>
            <p className="text-xs text-slate-500 mb-4">Current balance: {selectedProduct.stock} units</p>

            {error && (
              <div className="alert alert-error text-xs p-2 mb-3">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-3 text-xs">
              <div>
                <label className="label font-bold pb-1">Adjustment Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('RESTOCK')}
                    className={`btn btn-sm flex-1 ${adjustType === 'RESTOCK' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Restock (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADJUSTMENT')}
                    className={`btn btn-sm flex-1 ${adjustType === 'ADJUSTMENT' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Count Audit
                  </button>
                </div>
              </div>

              <div>
                <label className="label font-bold pb-1">
                  {adjustType === 'RESTOCK' ? 'Quantity to Add' : 'New Exact Balance'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  placeholder="e.g. 50"
                />
              </div>

              <div>
                <label className="label font-bold pb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  placeholder="e.g. Delivery from bulk supplier"
                />
              </div>

              <div className="modal-action flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustStockMutation.isPending}
                  className="btn btn-primary btn-sm font-bold"
                >
                  {adjustStockMutation.isPending ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
};
