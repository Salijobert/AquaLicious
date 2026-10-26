import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { VerifyEmailPromptPage } from './pages/VerifyEmailPromptPage.js';
import { VerifyEmailCompletePage } from './pages/VerifyEmailCompletePage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { ResetPasswordCompletePage } from './pages/ResetPasswordCompletePage.js';
import { ProductsPage } from './pages/ProductsPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { RequireAuth, RequireRole, PageLoadingSpinner } from './components/RouteGuards.js';
import { useCreateOrder } from './api/client.js';
import { ShoppingCart, X, Plus, Minus, Droplet } from 'lucide-react';

// Code-split admin and secondary pages with React.lazy
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then((m) => ({ default: m.DashboardPage })));
const SalesPage = lazy(() => import('./pages/SalesPage.js').then((m) => ({ default: m.SalesPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage.js').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.js').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.js').then((m) => ({ default: m.UsersPage })));
const ServerSettingsPage = lazy(() => import('./pages/ServerSettingsPage.js').then((m) => ({ default: m.ServerSettingsPage })));

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

  // Capacitor and Android hardware back button handling
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (isCartOpen) {
        e.preventDefault();
        setIsCartOpen(false);
      } else if (isSidebarOpen) {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('backbutton', handleBackButton);

    const capApp = (window as any).Capacitor?.Plugins?.App;
    let capHandle: any = null;
    if (capApp?.addListener) {
      capApp.addListener('backButton', ({ canGoBack }: { canGoBack?: boolean }) => {
        if (isCartOpen) {
          setIsCartOpen(false);
        } else if (isSidebarOpen) {
          setIsSidebarOpen(false);
        } else if (canGoBack) {
          window.history.back();
        } else {
          capApp.exitApp?.();
        }
      }).then((h: any) => {
        capHandle = h;
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('backbutton', handleBackButton);
      if (capHandle?.remove) {
        capHandle.remove();
      }
    };
  }, [isCartOpen, isSidebarOpen]);

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
    setIsCartOpen(true);
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

  const path = location.pathname.toLowerCase();
  const isLandingPage = path === '/' || path === '/index.html';
  const isAuthPage =
    path === '/login' ||
    path === '/register' ||
    path.startsWith('/verify-email') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password-complete');
  const showAdminLayout = !isAuthPage && user && user.role !== 'Customer';

  return (
    <div className="min-h-screen font-sans">
      {/* Mobile Splash Screen matching legacy selector */}
      {showSplash && (
        <div id="splash" className="fixed inset-0 z-[1000] bg-[#162e43] text-white flex flex-col items-center justify-center gap-4">
          <svg className="w-16 h-20" viewBox="0 0 24 30">
            <path fill="#2ca9da" d="M12 0C8 6 2 11 2 18a10 10 0 0020 0C22 11 16 6 12 0z" />
          </svg>
          <h1 className="text-xl font-black tracking-widest">AQUALICIOUS</h1>
        </div>
      )}

      {/* Mobile Top Header (available on mobile viewports for cart toggle) */}
      {!isAuthPage && (
        <div className="mobile-top lg:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1 rounded-md text-gray-700 hover:bg-gray-100"
            aria-label="Toggle navigation menu"
          >
            <Droplet className="w-6 h-6 text-[#1565c0] fill-[#1565c0]" />
          </button>
          <span className="font-serif font-bold text-[#0b3d91] text-base tracking-tight">AquaLicious</span>
          <button
            data-id="cart"
            onClick={() => setIsCartOpen(true)}
            className="p-1 relative text-gray-700 hover:bg-gray-100 rounded-md"
            aria-label="Customer Cart"
          >
            <ShoppingCart className="w-5 h-5 text-gray-700" />
            {cart.length > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#1565c0] text-white text-[10px] font-bold absolute -top-1 -right-1 flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className={!isAuthPage && !isLandingPage ? 'layout' : 'min-h-screen'}>
        {!isAuthPage && !isLandingPage && user && user.role !== 'Customer' && (
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        )}
        <div className={!isAuthPage && !isLandingPage ? `main ${(!user || user.role === 'Customer') ? '!ml-0' : ''}` : 'min-h-screen'}>
          {!isAuthPage && !isLandingPage && user && user.role !== 'Customer' && (
            <Navbar
              cartCount={cart.reduce((s, i) => s + i.qty, 0)}
              onOpenCart={() => setIsCartOpen(true)}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          )}
          <Suspense fallback={<PageLoadingSpinner />}>
            <Routes>
              {/* Public customer/landing routes */}
              <Route path="/" element={<RootPage onAddToCart={addToCart} />} />
              <Route path="/index.html" element={<RootPage onAddToCart={addToCart} />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPromptPage />} />
              <Route path="/verify-email.html" element={<VerifyEmailPromptPage />} />
              <Route path="/verify-email-complete" element={<VerifyEmailCompletePage />} />
              <Route path="/verify-email-complete.html" element={<VerifyEmailCompletePage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/forgot-password.html" element={<ForgotPasswordPage />} />
              <Route path="/reset-password-complete" element={<ResetPasswordCompletePage />} />
              <Route path="/reset-password-complete.html" element={<ResetPasswordCompletePage />} />

              {/* Products: Publicly accessible catalog; Admin sees management controls */}
              <Route path="/products" element={<ProductsPage onAddToCart={addToCart} />} />
              <Route path="/products.html" element={<ProductsPage onAddToCart={addToCart} />} />
              <Route path="/frontend/pages/products.html" element={<ProductsPage onAddToCart={addToCart} />} />

              {/* Orders: Requires signed-in account (Customer, Staff, or Admin) */}
              <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
              <Route path="/orders.html" element={<RequireAuth><OrdersPage /></RequireAuth>} />
              <Route path="/frontend/pages/orders.html" element={<RequireAuth><OrdersPage /></RequireAuth>} />

              {/* Dashboard: Restricted to Administrator and Staff */}
              <Route path="/dashboard" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><DashboardPage /></RequireRole>} />
              <Route path="/dashboard.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><DashboardPage /></RequireRole>} />
              <Route path="/frontend/pages/dashboard.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><DashboardPage /></RequireRole>} />

              {/* Sales (POS): Restricted to Administrator and Staff */}
              <Route path="/sales" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><SalesPage /></RequireRole>} />
              <Route path="/sales.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><SalesPage /></RequireRole>} />
              <Route path="/frontend/pages/sales.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><SalesPage /></RequireRole>} />

              {/* Inventory: Restricted to Administrator and Staff */}
              <Route path="/inventory" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><InventoryPage /></RequireRole>} />
              <Route path="/inventory.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><InventoryPage /></RequireRole>} />
              <Route path="/frontend/pages/inventory.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><InventoryPage /></RequireRole>} />

              {/* Reports & Analytics: Restricted to Administrator and Staff */}
              <Route path="/reports" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><ReportsPage /></RequireRole>} />
              <Route path="/reports.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><ReportsPage /></RequireRole>} />
              <Route path="/frontend/pages/reports.html" element={<RequireRole allowedRoles={['Administrator', 'Staff']}><ReportsPage /></RequireRole>} />

              {/* User Management: Restricted to Administrator Only */}
              <Route path="/users" element={<RequireRole allowedRoles={['Administrator']} fallbackPath="/dashboard.html"><UsersPage /></RequireRole>} />
              <Route path="/users.html" element={<RequireRole allowedRoles={['Administrator']} fallbackPath="/dashboard.html"><UsersPage /></RequireRole>} />
              <Route path="/frontend/pages/users.html" element={<RequireRole allowedRoles={['Administrator']} fallbackPath="/dashboard.html"><UsersPage /></RequireRole>} />

              {/* Cluster and Server Settings */}
              <Route path="/settings" element={<ServerSettingsPage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      {/* Cart Drawer for Mobile and Web Customers */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setIsCartOpen(false)}
          />
          <div className="relative w-full sm:max-w-sm bg-white shadow-2xl flex flex-col h-full z-10 p-6">
            <div className="flex justify-between items-center border-b pb-3 mb-4 shrink-0">
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
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{item.name}</div>
                      <div className="text-slate-500 font-medium">₱{item.price.toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-lg bg-white">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="btn btn-ghost btn-xs px-2"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="btn btn-ghost btn-xs px-2"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <form id="checkout-form" onSubmit={handleMobileCheckout} className="border-t pt-4 space-y-3 shrink-0">
                <div className="flex justify-between items-center text-sm font-bold">
                  <span>Subtotal:</span>
                  <span className="text-primary text-base">₱{cartTotal.toFixed(2)}</span>
                </div>

                <div className="flex gap-2">
                  <label className="flex-1 btn btn-xs btn-outline font-bold cursor-pointer">
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
                  <label className="flex-1 btn btn-xs btn-outline font-bold cursor-pointer">
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
