import React, { useState, useRef } from 'react';
import { useProducts, useCheckout, useSales } from '../api/client.js';
import { ShoppingCart, Plus, Minus, Trash2, Search, AlertCircle } from 'lucide-react';
import { ReceiptModal } from '../components/ReceiptModal.js';
import { VoidModal } from '../components/VoidModal.js';
import { VirtualTableBody, SalesHistorySkeletonRow } from '../components/virtual/index.js';

export const SalesPage: React.FC = () => {
  const { data: products } = useProducts();
  const { data: salesHistory } = useSales();
  const checkoutMutation = useCheckout();

  const [cart, setCart] = useState<Array<{ id: number; name: string; sku: string; price: number; qty: number }>>([]);
  const [cashTendered, setCashTendered] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<any | null>(null);
  const [voidingSale, setVoidingSale] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const salesContainerRef = useRef<HTMLDivElement>(null);

  // Stats calculation
  const totalSales = salesHistory?.length || 0;
  const activeSales = salesHistory?.filter((s: any) => s.status !== 'VOIDED') || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySales = activeSales.filter((s: any) => (s.sold_at || s.created_at || '').slice(0, 10) === todayStr);
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
  const totalRevenue = activeSales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
  const avgTx = totalSales > 0 ? (totalRevenue / totalSales).toFixed(2) : '0.00';

  const categories = ['All', 'Slim', 'Round', 'Purified', 'Mineral'];
  const filteredProducts = products?.filter((p: any) => {
    const matchesCat = selectedCategory === 'All' ? true : p.category === selectedCategory;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesCat && matchesSearch;
  });

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
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error || ''}
      </div>

      {/* STAT ROW */}
      <div className="stat-grid" id="salesStats">
        <div className="stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{todaySales.length}</div>
          <div className="stat-sub">₱{todayRevenue.toLocaleString()} revenue</div>
          <div className="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2z" />
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{totalSales}</div>
          <div className="stat-sub">All time recorded</div>
          <div className="stat-icon icon-green">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">₱{totalRevenue.toLocaleString()}</div>
          <div className="stat-sub">Lifetime station sales</div>
          <div className="stat-icon icon-orange">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <text x="12" y="18.5" textAnchor="middle" fontSize="19" fontWeight="700" fontFamily="Poppins,Arial,sans-serif">₱</text>
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Transaction</div>
          <div className="stat-value">₱{avgTx}</div>
          <div className="stat-sub">Average per receipt</div>
          <div className="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Playwright Test Heading Requirement */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Quick checkout</h1>
          <p className="text-xs text-slate-500 font-semibold">Walk-in POS Sales Terminal</p>
        </div>
      </div>

      {/* POS MAIN AREA: 2 COLUMNS (Products on Left, Cart on Right) */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Products Grid */}
        <div className="lg:col-span-2 space-y-4">
          {/* Toolbar Search & Chips */}
          <div className="toolbar bg-white p-3 rounded-xl border border-gray-200">
            <div className="search-wrap">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="search-input"
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCategory(c)}
                  className={`btn btn-sm ${
                    c === selectedCategory ? 'btn-primary' : 'btn-outline'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredProducts?.map((p: any) => (
              <div
                key={p.id}
                className="product card bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <h3 className="font-bold text-sm text-gray-900 truncate">{p.name}</h3>
                    <span className="badge badge-info text-[10px]">{p.category}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.sku} · {p.volume_label}</div>
                  <div className="price text-lg font-black text-[#1565c0] mt-2">
                    ₱{Number(p.selling_price).toFixed(2)}
                  </div>
                  <div className="muted text-[11px] text-gray-500">
                    Stock: <strong className={p.stock <= p.reorder_pt ? 'text-red-600 font-bold' : ''}>{p.stock}</strong> units
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
        <div className="card bg-white p-5 rounded-2xl shadow-sm border border-gray-200 h-fit">
          <div className="card-header border-b pb-3 mb-4 px-0 pt-0">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#1565c0]" /> Active POS Cart
            </h2>
            <span className="badge badge-info font-bold">{cart.length} items</span>
          </div>

          {error && (
            <div className="p-2.5 mb-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2 border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              Cart is empty. Select products on the left to start checkout.
            </div>
          ) : (
            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="cart-line flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                  <div>
                    <div className="font-bold text-gray-800">{item.name}</div>
                    <div className="text-gray-500 font-medium">₱{item.price.toFixed(2)} each</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-gray-300 rounded-lg bg-white">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="px-2 py-1 text-gray-500 hover:text-gray-900"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-bold text-gray-800">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="px-2 py-1 text-gray-500 hover:text-gray-900"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold text-gray-600">Total Due:</span>
              <span className="text-2xl font-black text-[#0b3d91]">₱{totalAmount.toFixed(2)}</span>
            </div>

            <form id="checkout-form" onSubmit={handleCheckout} className="space-y-3 pt-2">
              <div className="form-group mb-2">
                <label className="form-label text-xs font-bold text-gray-700">Cash Tendered (₱) *</label>
                <input
                  type="number"
                  name="cash_tendered"
                  required
                  step="0.01"
                  min={totalAmount}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="form-control font-bold text-gray-900 text-base"
                  placeholder="e.g. 300"
                />
              </div>

              {Number(cashTendered) >= totalAmount && totalAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 px-1 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span>Calculated Change:</span>
                  <span>₱{(Number(cashTendered) - totalAmount).toFixed(2)}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={cart.length === 0 || checkoutMutation.isPending}
                className="btn btn-primary w-full font-bold shadow"
              >
                {checkoutMutation.isPending ? 'Processing Sale...' : 'Charge Cash Sale'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Recent POS Transactions Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🧾 Walk-in POS Sales History</span>
          <span className="text-xs text-gray-500">{salesHistory?.length || 0} transactions</span>
        </div>
        <div ref={salesContainerRef} className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-xl border border-gray-100">
          <table>
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-xs">
              <tr>
                <th>Order #</th>
                <th>Cashier / User</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date & Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <VirtualTableBody
              items={salesHistory}
              containerRef={salesContainerRef}
              rowHeight={52}
              colSpan={6}
              renderRow={(sale: any) => (
                <tr key={sale.id} className={sale.status === 'VOIDED' ? 'opacity-60 line-through' : ''}>
                  <td className="font-mono font-bold text-[#1565c0]">#{sale.order_number}</td>
                  <td>{sale.cashier}</td>
                  <td className="font-bold">₱{Number(sale.total).toFixed(2)}</td>
                  <td>
                    <span
                      className={`badge ${
                        sale.status === 'VOIDED' ? 'badge-danger' : 'badge-success'
                      }`}
                    >
                      {sale.status}
                    </span>
                  </td>
                  <td className="text-gray-500">
                    {new Date(sale.sold_at || sale.created_at).toLocaleString('en-PH')}
                  </td>
                  <td>
                    {sale.status !== 'VOIDED' && (
                      <button
                        onClick={() => setVoidingSale(sale)}
                        className="btn btn-danger btn-xs font-bold"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              )}
              renderSkeletonRow={(index) => <SalesHistorySkeletonRow key={index} />}
              emptyRow={
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No sales transactions recorded yet.
                  </td>
                </tr>
              }
            />
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
