import React, { useState } from 'react';
import { useInventory, useAdjustStock } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Calculator, Plus, History, AlertTriangle } from 'lucide-react';
import { RopCalculatorModal } from '../components/RopCalculatorModal.js';

export const InventoryPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const { data: inventory } = useInventory();
  const { data: ledger } = useInventory(true);
  const adjustStockMutation = useAdjustStock();

  const [isRopOpen, setIsRopOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [adjustType, setAdjustType] = useState<'RESTOCK' | 'ADJUSTMENT'>('RESTOCK');
  const [adjustQty, setAdjustQty] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentCategory, setCurrentCategory] = useState<string>('All');

  const categories = ['All', 'Slim', 'Round', 'Purified', 'Mineral'];
  const filteredInventory = inventory?.filter((p: any) =>
    currentCategory === 'All' ? true : p.category === currentCategory
  );

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
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error || ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Inventory Monitoring</h1>
          <p className="text-xs text-slate-500 font-semibold">Stock Levels, Usage Analytics & Dynamic ROP Thresholds</p>
        </div>

        <button
          data-action="rop"
          onClick={() => setIsRopOpen(true)}
          className="btn btn-primary btn-sm gap-2 font-bold shadow"
        >
          <Calculator className="w-4 h-4" /> ROP Calculator
        </button>
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap" id="catChips">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCurrentCategory(c)}
            className={`btn btn-sm ${
              c === currentCategory ? 'btn-primary' : 'btn-outline'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Stock Levels Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📦 Stock Levels & Capacity</span>
          {isAdmin && (
            <button
              onClick={() => {
                if (inventory && inventory.length > 0) {
                  setSelectedProduct(inventory[0]);
                  setAdjustType('RESTOCK');
                }
              }}
              className="btn btn-primary btn-sm"
            >
              + Restock Product
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table id="tableBody">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Stock Level</th>
                <th>Status</th>
                {isAdmin && <th>Quick Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredInventory && filteredInventory.length > 0 ? (
                filteredInventory.map((p: any) => {
                  const maxRef = Math.max(p.effective_rop * 2, 50);
                  const pct = Math.min(100, Math.round((p.stock / maxRef) * 100));
                  const isCritical = p.status === 'Critical' || p.stock <= p.effective_rop;
                  const isWarning = p.status === 'Warning';
                  const barColor = isCritical ? 'var(--red)' : isWarning ? 'var(--orange)' : 'var(--green)';

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="text-[10px] text-gray-400">{p.sku}</div>
                      </td>
                      <td>
                        <span className="badge badge-info">{p.category}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: isCritical ? 'var(--red)' : 'inherit' }}>
                        {p.stock} units
                      </td>
                      <td>
                        <div className="stock-bar-wrap mb-1">
                          <div className="stock-bar" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-[10px] text-gray-500">{pct}% capacity</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isCritical ? 'badge-danger' : isWarning ? 'badge-warning' : 'badge-success'
                          }`}
                        >
                          {p.status || (isCritical ? 'Low Stock' : 'In Stock')}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button
                            onClick={() => {
                              setSelectedProduct(p);
                              setAdjustType('RESTOCK');
                            }}
                            className="btn btn-outline btn-xs"
                          >
                            Restock
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No products found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Ledger Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📜 Immutable Stock Movement Ledger</span>
          <span className="text-xs text-gray-500">Historical Audit Records</span>
        </div>
        <div className="overflow-x-auto max-h-[350px]">
          <table>
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th>Date & Time</th>
                <th>Product</th>
                <th>Movement Type</th>
                <th>Delta</th>
                <th>Prev → New</th>
                <th>Actor</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger && ledger.length > 0 ? (
                ledger.map((entry: any) => (
                  <tr key={entry.id}>
                    <td className="text-gray-500">
                      {new Date(entry.created_at).toLocaleString('en-PH')}
                    </td>
                    <td>
                      <strong>{entry.product?.name || entry.product_id}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          entry.type === 'SALE'
                            ? 'badge-warning'
                            : entry.type === 'RESTOCK'
                            ? 'badge-success'
                            : 'badge-info'
                        }`}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td className="font-bold">
                      {entry.quantity_delta > 0 ? `+${entry.quantity_delta}` : entry.quantity_delta}
                    </td>
                    <td className="text-gray-600">
                      {entry.balance_before} → {entry.balance_after}
                    </td>
                    <td>{entry.actor?.name || entry.actor_id || 'System'}</td>
                    <td className="text-gray-500 truncate max-w-[200px]">{entry.notes || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No movement records recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RESTOCK / ADJUST MODAL */}
      {selectedProduct && (
        <div className="modal-overlay active">
          <div className="modal aq-modal">
            <div className="modal-header">
              <span className="modal-title">
                {adjustType === 'RESTOCK' ? 'Restock Product' : 'Adjust Inventory'}
              </span>
              <button className="modal-close" onClick={() => setSelectedProduct(null)}>
                ✕
              </button>
            </div>
            {error && (
              <div className="p-2.5 mb-3 text-xs text-red-600 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            )}
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Product *</label>
                <select
                  className="form-control"
                  value={selectedProduct.id}
                  onChange={(e) => {
                    const found = inventory?.find((p: any) => p.id === Number(e.target.value));
                    if (found) setSelectedProduct(found);
                  }}
                >
                  {inventory?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.stock} units)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Action Type</label>
                  <select
                    className="form-control"
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as any)}
                  >
                    <option value="RESTOCK">Restock (+)</option>
                    <option value="ADJUSTMENT">Manual Adjustment</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="form-control"
                    placeholder="e.g. 50"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reason / Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Supplier delivery ref #543"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedProduct(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustStockMutation.isPending}
                  className="btn btn-primary"
                >
                  {adjustStockMutation.isPending ? 'Applying...' : 'Apply Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROP CALCULATOR MODAL */}
      <RopCalculatorModal isOpen={isRopOpen} onClose={() => setIsRopOpen(false)} />
    </div>
  );
};
