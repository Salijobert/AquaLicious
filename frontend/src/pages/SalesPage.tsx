import React, { useState } from 'react';
import { useProducts, useCheckout, useSales } from '../api/client.js';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle, Receipt, AlertCircle } from 'lucide-react';
import { ReceiptModal } from '../components/ReceiptModal.js';
import { VoidModal } from '../components/VoidModal.js';

export const SalesPage: React.FC = () => {
  const { data: products, isLoading: prodLoading } = useProducts();
  const { data: salesHistory } = useSales();
  const checkoutMutation = useCheckout();

  const [cart, setCart] = useState<Array<{ id: number; name: string; sku: string; price: number; qty: number }>>([]);
  const [cashTendered, setCashTendered] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<any | null>(null);
  const [voidingSale, setVoidingSale] = useState<any | null>(null);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.selling_price),
          qty: 1
        }
      ];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as any[]
    );
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) {
      setError('Please add items to the cart');
      return;
    }

    const cash = Number(cashTendered);
    if (isNaN(cash) || cash < totalAmount) {
      setError(`Insufficient cash tendered. Total is ₱${totalAmount.toFixed(2)}, entered ₱${cashTendered || 0}`);
      return;
    }

    try {
      const receipt = await checkoutMutation.mutateAsync({
        items: cart.map((i) => ({ product_id: i.id, qty: i.qty })),
        cash_tendered: cash,
        expected_total: totalAmount.toFixed(2),
        request_key: crypto.randomUUID()
      });

      setCompletedReceipt(receipt);
      setCart([]);
      setCashTendered('');
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error || ''}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Quick checkout</h1>
          <p className="text-xs text-slate-500 font-semibold">Walk-in POS Sales Terminal</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Products Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="text-xs uppercase font-bold text-slate-500">Available Products</div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {products?.map((p: any) => (
              <div
                key={p.id}
                className="product card bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <h3 className="font-bold text-sm text-slate-900 truncate">{p.name}</h3>
                    <span className="badge badge-sm badge-outline text-[10px]">{p.category}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{p.sku} · {p.volume_label}</div>
                  <div className="price text-lg font-black text-primary mt-2">
                    ₱{Number(p.selling_price).toFixed(2)}
                  </div>
                  <div className="muted text-[11px] text-slate-500">
                    Stock: <strong className={p.stock <= p.reorder_pt ? 'text-error font-bold' : ''}>{p.stock}</strong> units
                  </div>
                </div>

                <button
                  data-action="add"
                  data-id={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stock <= 0}
                  className="btn btn-primary btn-sm mt-3 w-full gap-1 font-bold text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* POS Cart & Checkout */}
        <div className="card bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" /> Active Cart
            </h2>
            <span className="badge badge-secondary badge-sm font-bold">{cart.length} items</span>
          </div>

          {error && (
            <div className="alert alert-error text-xs p-2.5 mb-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Cart is empty. Select products on the left to start checkout.
            </div>
          ) : (
            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="cart-line flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{item.name}</div>
                    <div className="text-slate-500 font-medium">₱{item.price.toFixed(2)} each</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-lg bg-white">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="btn btn-ghost btn-xs px-2"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-bold">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="btn btn-ghost btn-xs px-2"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="btn btn-ghost btn-xs text-error p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold text-slate-600">Total Due:</span>
              <span className="text-xl font-black text-primary">₱{totalAmount.toFixed(2)}</span>
            </div>

            <form id="checkout-form" onSubmit={handleCheckout} className="space-y-3 pt-2">
              <div>
                <label className="label text-xs font-bold text-slate-600 pb-1">Cash Tendered (₱)</label>
                <input
                  type="number"
                  name="cash_tendered"
                  required
                  step="0.01"
                  min={totalAmount}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800 font-bold"
                  placeholder="e.g. 300"
                />
              </div>

              {Number(cashTendered) >= totalAmount && totalAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 px-1">
                  <span>Calculated Change:</span>
                  <span>₱{(Number(cashTendered) - totalAmount).toFixed(2)}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={cart.length === 0 || checkoutMutation.isPending}
                className="btn btn-primary btn-sm w-full font-bold text-white shadow"
              >
                {checkoutMutation.isPending ? 'Processing Sale...' : 'Charge Cash Sale'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Recent Transactions & Void Management */}
      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-8">
        <h2 className="text-base font-bold text-slate-900 mb-3">Recent Walk-in POS Transactions</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th>Order #</th>
                <th>Cashier</th>
                <th>Total</th>
                <th>Status</th>
                <th>Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {salesHistory?.map((sale: any) => (
                <tr key={sale.id} className="hover">
                  <td className="font-mono font-bold text-primary">{sale.order_number}</td>
                  <td>{sale.cashier}</td>
                  <td className="font-bold">₱{Number(sale.total).toFixed(2)}</td>
                  <td>
                    <span className={`badge badge-xs font-bold ${
                      sale.status === 'VOIDED' ? 'badge-error text-white' : 'badge-success text-white'
                    }`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="text-slate-500">{new Date(sale.sold_at).toLocaleTimeString('en-PH')}</td>
                  <td>
                    {sale.status !== 'VOIDED' && (
                      <button
                        onClick={() => setVoidingSale(sale)}
                        className="btn btn-ghost btn-xs text-error font-bold"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {completedReceipt && (
        <ReceiptModal
          receipt={completedReceipt}
          onClose={() => setCompletedReceipt(null)}
        />
      )}

      {voidingSale && (
        <VoidModal
          sale={voidingSale}
          isOpen={!!voidingSale}
          onClose={() => setVoidingSale(null)}
        />
      )}
    </div>
  );
};
