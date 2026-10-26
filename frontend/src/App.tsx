import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { SalesPage } from './pages/SalesPage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { ProductsPage } from './pages/ProductsPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ServerSettingsPage } from './pages/ServerSettingsPage.js';
import { useCreateOrder } from './api/client.js';
import { ShoppingCart, X, Plus, Minus, Droplet } from 'lucide-react';

interface CartItem {
  id: number;
  name: string;
  sku: string;
  price: number;
  qty: number;
}

const RootPage: React.FC<{ onAddToCart: (p: any) => void }> = ({ onAddToCart }) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile ? <ProductsPage onAddToCart={onAddToCart} /> : <LandingPage />;
};

export const App: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const createOrderMutation = useCreateOrder();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH_QR' | 'MAYA_QR'>('CASH');
  const [showSplash, setShowSplash] = useState(true);

  // Detach splash screen after initial mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
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

  const updateCartQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleMobileCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsCartOpen(false);
      navigate('/login');
      return;
    }

    if (cart.length === 0) return;

    try {
      await createOrderMutation.mutateAsync({
        items: cart.map((i) => ({ product_id: i.id, qty: i.qty })),
        fulfillment,
        address: fulfillment === 'DELIVERY' ? address : undefined,
        method: paymentMethod,
        expected_total: cartTotal.toFixed(2),
        request_key: crypto.randomUUID()
      });

      setCart([]);
      setIsCartOpen(false);
      navigate('/orders.html');
    } catch (err: any) {
      alert(err.message || 'Checkout failed');
    }
  };

  const isAuthOnlyPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Mobile Splash Screen matching legacy selector */}
      {showSplash && (
        <div id="splash" className="fixed inset-0 z-[1000] bg-[#162e43] text-white flex flex-col items-center justify-center gap-4">
          <svg className="w-16 h-20" viewBox="0 0 24 30">
            <path fill="#2ca9da" d="M12 0C8 6 2 11 2 18a10 10 0 0020 0C22 11 16 6 12 0z" />
          </svg>
          <h1 className="text-xl font-black tracking-widest">AQUALICIOUS</h1>
        </div>
      )}

      {/* Mobile Top Header (always available on mobile viewports unless auth page) */}
      {!isAuthOnlyPage && (
        <div className="mobile-top lg:hidden flex items-center justify-between px-4 py-2 bg-white border-b sticky top-0 z-30">
          <button onClick={() => setIsSidebarOpen(true)} className="btn btn-ghost btn-sm p-1">
            <Droplet className="w-6 h-6 text-secondary fill-secondary" />
          </button>
          <span className="font-black text-primary text-sm tracking-wide">AQUALICIOUS</span>
          <button
            data-id="cart"
            onClick={() => setIsCartOpen(true)}
            className="btn btn-ghost btn-sm relative p-1"
          >
            <ShoppingCart className="w-5 h-5 text-slate-700" />
            {cart.length > 0 && (
              <span className="badge badge-secondary badge-xs absolute -top-1 -right-1 font-bold">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      )}

      {!isAuthOnlyPage && (
        <div className="hidden lg:block">
          <Navbar
            cartCount={cart.length}
            onOpenCart={() => setIsCartOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        </div>
      )}

      <div className="flex-1 flex">
        {!isAuthOnlyPage && user && (
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        )}

        <main className={`flex-1 p-4 sm:p-6 lg:p-8 ${!isAuthOnlyPage && user ? 'lg:ml-64' : ''}`}>
          <Routes>
            <Route path="/" element={<RootPage onAddToCart={addToCart} />} />
            <Route path="/index.html" element={<RootPage onAddToCart={addToCart} />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Dashboard routes */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard.html" element={<DashboardPage />} />
            <Route path="/frontend/pages/dashboard.html" element={<DashboardPage />} />

            {/* Sales routes */}
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/sales.html" element={<SalesPage />} />
            <Route path="/frontend/pages/sales.html" element={<SalesPage />} />

            {/* Inventory routes */}
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/inventory.html" element={<InventoryPage />} />
            <Route path="/frontend/pages/inventory.html" element={<InventoryPage />} />

            {/* Products routes */}
            <Route path="/products" element={<ProductsPage onAddToCart={addToCart} />} />
            <Route path="/products.html" element={<ProductsPage onAddToCart={addToCart} />} />
            <Route path="/frontend/pages/products.html" element={<ProductsPage onAddToCart={addToCart} />} />

            {/* Orders routes */}
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders.html" element={<OrdersPage />} />
            <Route path="/frontend/pages/orders.html" element={<OrdersPage />} />

            {/* Reports routes */}
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports.html" element={<ReportsPage />} />
            <Route path="/frontend/pages/reports.html" element={<ReportsPage />} />

            {/* Users routes */}
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users.html" element={<UsersPage />} />
            <Route path="/frontend/pages/users.html" element={<UsersPage />} />

            {/* Settings route */}
            <Route path="/settings" element={<ServerSettingsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Cart Drawer for Mobile and Web Customers */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full z-10 p-6">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-secondary" /> Customer Cart
              </h2>
              <button onClick={() => setIsCartOpen(false)} className="btn btn-ghost btn-sm btn-circle">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-slate-400 text-xs">
                Your cart is empty. Add water products to order.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="cart-line p-3 bg-slate-50 rounded-xl border flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-slate-500">₱{item.price.toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-lg bg-white">
                        <button onClick={() => updateCartQty(item.id, -1)} className="btn btn-ghost btn-xs px-2">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="btn btn-ghost btn-xs px-2">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center font-bold text-base">
                <span>Subtotal:</span>
                <span className="text-primary">₱{cartTotal.toFixed(2)}</span>
              </div>

              <form id="checkout-form" onSubmit={handleMobileCheckout} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer rounded-lg border text-center py-2 font-bold text-xs transition-colors ${fulfillment === 'PICKUP' ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                    <input
                      type="radio"
                      name="fulfillment"
                      value="PICKUP"
                      checked={fulfillment === 'PICKUP'}
                      onChange={() => setFulfillment('PICKUP')}
                      className="hidden"
                    />
                    Pickup
                  </label>
                  <label className={`cursor-pointer rounded-lg border text-center py-2 font-bold text-xs transition-colors ${fulfillment === 'DELIVERY' ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                    <input
                      type="radio"
                      name="fulfillment"
                      value="DELIVERY"
                      checked={fulfillment === 'DELIVERY'}
                      onChange={() => setFulfillment('DELIVERY')}
                      className="hidden"
                    />
                    Delivery
                  </label>
                </div>

                {fulfillment === 'DELIVERY' && (
                  <input
                    type="text"
                    required
                    placeholder="Delivery Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                )}

                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="select select-bordered select-sm w-full bg-slate-50 text-slate-800"
                >
                  <option value="CASH">Cash on Delivery / Pickup</option>
                  <option value="GCASH_QR">GCash QR Code</option>
                  <option value="MAYA_QR">Maya QR Code</option>
                </select>

                <button
                  type="submit"
                  disabled={cart.length === 0 || createOrderMutation.isPending}
                  className="btn btn-primary btn-sm w-full font-bold text-white shadow"
                >
                  {createOrderMutation.isPending
                    ? 'Submitting...'
                    : user
                    ? 'Place Water Order'
                    : 'Sign In to Order'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
