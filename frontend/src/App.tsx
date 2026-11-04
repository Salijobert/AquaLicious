import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { CustomerNavbar } from './components/CustomerNavbar.js';
import { Sidebar } from './components/Sidebar.js';
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
import { resolver } from './api/multiServerResolver.js';
import { TermsPrivacyModal } from './components/TermsPrivacyModal.js';
import { ShoppingCart, X, Plus, Minus, Droplet, AlertTriangle } from 'lucide-react';

// Code-split admin pages with React.lazy
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then((m) => ({ default: m.DashboardPage })));
const SalesPage = lazy(() => import('./pages/SalesPage.js').then((m) => ({ default: m.SalesPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage.js').then((m) => ({ default: m.InventoryPage })));
const AdminProductsPage = lazy(() => import('./pages/AdminProductsPage.js').then((m) => ({ default: m.AdminProductsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.js').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.js').then((m) => ({ default: m.UsersPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage })));

// Helper component preserving query strings and hash parameters on legacy alias redirections
const PreserveQueryRedirect: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} replace />;
};

interface CartItem {
  id: number;
  name: string;
  sku: string;
  price: number;
  qty: number;
}

export const App: React.FC = () => {
  const { user, role, isLoading } = useAuth();
  const isAdmin = role === 'Administrator';
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
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);

  useEffect(() => {
    const onConsentReq = () => setIsConsentModalOpen(true);
    window.addEventListener('aqualicious:consent-required', onConsentReq);
    return () => window.removeEventListener('aqualicious:consent-required', onConsentReq);
  }, []);

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

  const addToCart = (product: any, quantity: number = 1) => {
    const qtyToAdd = Math.max(1, quantity || 1);
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qtyToAdd } : i));
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.selling_price),
          qty: qtyToAdd
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
      navigate('/login', { state: { from: location } });
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
      navigate('/orders');
    } catch (err: any) {
      if (err.code === 'CONSENT_REQUIRED' || (err.status === 403 && err.message?.includes('Consent'))) {
        setIsConsentModalOpen(true);
        return;
      }
      alert(err.message || 'Checkout failed');
    }
  };

  const path = location.pathname.toLowerCase();
  const isAuthPage =
    path === '/login' ||
    path === '/register' ||
    path.startsWith('/verify-email') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password-complete');
  const isHomePage = path === '/' || path === '/index.html' || path === '/products' || path === '/products.html';
  const showAdminLayout = !isAuthPage && !isHomePage && isAdmin;

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

      {/* Top Mobile Bar for Admin when in Admin Layout (cart button removed for Admin) */}
      {showAdminLayout && (
        <div className="mobile-top lg:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1 rounded-md text-gray-700 hover:bg-gray-100"
            aria-label="Toggle navigation menu"
          >
            <Droplet className="w-6 h-6 text-[#1565c0] fill-[#1565c0]" />
          </button>
          <span className="font-serif font-bold text-[#0b3d91] text-base tracking-tight">AquaLicious</span>
          <div className="w-6" />
        </div>
      )}

      {/* Unified Storefront Header (CustomerNavbar) - Rendered on Home Page and Customer Pages */}
      {!isAuthPage && !showAdminLayout && (
        <CustomerNavbar
          cartCount={cart.reduce((s, i) => s + i.qty, 0)}
          onOpenCart={() => setIsCartOpen(true)}
        />
      )}

      <div className={showAdminLayout ? 'layout' : 'min-h-screen'}>
        {showAdminLayout && (
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        )}
        <div className={showAdminLayout ? 'main' : (!isAuthPage ? 'pt-16' : 'min-h-screen')}>
          {showAdminLayout && (
            <Navbar
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          )}
          <Suspense fallback={<PageLoadingSpinner />}>
            <Routes>
              {/* CANONICAL CLEAN ROUTES */}

              {/* 1. Home / Products Catalog: Signed-in Admin immediately redirected to /dashboard */}
              <Route
                path="/"
                element={
                  isLoading ? (
                    <PageLoadingSpinner />
                  ) : isAdmin ? (
                    <Navigate to="/dashboard" replace />
                  ) : (
                    <ProductsPage onAddToCart={addToCart} />
                  )
                }
              />

              {/* 2. Authentication Flow */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPromptPage />} />
              <Route path="/verify-email-complete" element={<VerifyEmailCompletePage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password-complete" element={<ResetPasswordCompletePage />} />

              {/* 3. Orders: Accessible to all authenticated users (Customer, Admin) */}
              <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />

              {/* 4. Administrative Routes (Admin Only) */}
              <Route path="/dashboard" element={<RequireRole allowedRoles={['Administrator']}><DashboardPage /></RequireRole>} />
              <Route path="/sales" element={<RequireRole allowedRoles={['Administrator']}><SalesPage /></RequireRole>} />
              <Route path="/inventory" element={<RequireRole allowedRoles={['Administrator']}><InventoryPage /></RequireRole>} />
              <Route path="/admin/products" element={<RequireRole allowedRoles={['Administrator']}><AdminProductsPage /></RequireRole>} />
              <Route path="/reports" element={<RequireRole allowedRoles={['Administrator']}><ReportsPage /></RequireRole>} />
              <Route path="/users" element={<RequireRole allowedRoles={['Administrator']} fallbackPath="/"><UsersPage /></RequireRole>} />

              {/* CLIENT-SIDE FALLBACK ALIAS REDIRECTS (FOR HASHROUTER & LEGACY BOOKMARKS) */}
              <Route path="/index.html" element={<PreserveQueryRedirect to="/" />} />
              <Route path="/products" element={<PreserveQueryRedirect to="/" />} />
              <Route path="/products.html" element={<PreserveQueryRedirect to="/" />} />
              <Route path="/frontend/pages/products.html" element={<PreserveQueryRedirect to="/" />} />

              <Route path="/admin/products.html" element={<PreserveQueryRedirect to="/admin/products" />} />
              <Route path="/frontend/pages/admin/products.html" element={<PreserveQueryRedirect to="/admin/products" />} />

              <Route path="/login.html" element={<PreserveQueryRedirect to="/login" />} />
              <Route path="/frontend/pages/login.html" element={<PreserveQueryRedirect to="/login" />} />

              <Route path="/register.html" element={<PreserveQueryRedirect to="/register" />} />
              <Route path="/frontend/pages/register.html" element={<PreserveQueryRedirect to="/register" />} />

              <Route path="/verify-email.html" element={<PreserveQueryRedirect to="/verify-email" />} />
              <Route path="/frontend/pages/verify-email.html" element={<PreserveQueryRedirect to="/verify-email" />} />

              <Route path="/verify-email-complete.html" element={<PreserveQueryRedirect to="/verify-email-complete" />} />
              <Route path="/frontend/pages/verify-email-complete.html" element={<PreserveQueryRedirect to="/verify-email-complete" />} />

              <Route path="/forgot-password.html" element={<PreserveQueryRedirect to="/forgot-password" />} />
              <Route path="/frontend/pages/forgot-password.html" element={<PreserveQueryRedirect to="/forgot-password" />} />

              <Route path="/reset-password-complete.html" element={<PreserveQueryRedirect to="/reset-password-complete" />} />
              <Route path="/frontend/pages/reset-password-complete.html" element={<PreserveQueryRedirect to="/reset-password-complete" />} />

              <Route path="/dashboard.html" element={<PreserveQueryRedirect to="/dashboard" />} />
              <Route path="/frontend/pages/dashboard.html" element={<PreserveQueryRedirect to="/dashboard" />} />

              <Route path="/sales.html" element={<PreserveQueryRedirect to="/sales" />} />
              <Route path="/frontend/pages/sales.html" element={<PreserveQueryRedirect to="/sales" />} />

              <Route path="/inventory.html" element={<PreserveQueryRedirect to="/inventory" />} />
              <Route path="/frontend/pages/inventory.html" element={<PreserveQueryRedirect to="/inventory" />} />

              <Route path="/orders.html" element={<PreserveQueryRedirect to="/orders" />} />
              <Route path="/frontend/pages/orders.html" element={<PreserveQueryRedirect to="/orders" />} />

              <Route path="/reports.html" element={<PreserveQueryRedirect to="/reports" />} />
              <Route path="/frontend/pages/reports.html" element={<PreserveQueryRedirect to="/reports" />} />

              <Route path="/users.html" element={<PreserveQueryRedirect to="/users" />} />
              <Route path="/frontend/pages/users.html" element={<PreserveQueryRedirect to="/users" />} />

              {/* Catch-all 404 / Unknown route handler (renders branded 404 for all users) */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      {/* Cart Drawer for Mobile and Web Customers */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
            <div className="p-4 bg-[#0b3d91] text-white flex justify-between items-center shadow-md">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#90caf9]" />
                <h3 className="font-bold text-base">Your Water Cart</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-md"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 divide-y divide-gray-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                  <ShoppingCart className="w-12 h-12 mb-3 stroke-1 text-gray-300" />
                  <p className="font-semibold text-sm text-gray-600">Your cart is empty</p>
                  <p className="text-xs mt-1">Browse our products and add mineral water to get started.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">{item.name}</h4>
                      <p className="text-xs text-[#1565c0] font-bold mt-0.5">₱{item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1 bg-gray-50">
                      <button
                        onClick={() => updateCartQty(item.id, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold w-6 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.id, 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <form onSubmit={handleMobileCheckout} className="p-4 bg-gray-50 border-t border-gray-200 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">
                  <span>Total Amount:</span>
                  <span className="text-[#1565c0] text-base">₱{cartTotal.toFixed(2)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Fulfillment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFulfillment('PICKUP')}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        fulfillment === 'PICKUP'
                          ? 'bg-[#1565c0] text-white border-[#1565c0] shadow-sm'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Pickup at Station
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillment('DELIVERY')}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        fulfillment === 'DELIVERY'
                          ? 'bg-[#1565c0] text-white border-[#1565c0] shadow-sm'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Station Delivery
                    </button>
                  </div>
                </div>

                {fulfillment === 'DELIVERY' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Delivery Address *</label>
                    <textarea
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, Barangay, City, Landmark"
                      className="w-full text-xs p-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#1565c0] bg-white resize-none"
                      rows={2}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-[#1565c0]"
                  >
                    <option value="CASH">Cash on Delivery / Pickup</option>
                    <option value="GCASH_QR">GCash QR Payment</option>
                    <option value="MAYA_QR">Maya QR Payment</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={createOrderMutation.isPending}
                  className="btn btn-primary w-full py-2.5 font-bold shadow-md flex items-center justify-center gap-2 text-sm"
                >
                  {createOrderMutation.isPending ? 'Placing Order...' : `Place Order (₱${cartTotal.toFixed(2)})`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mandatory Terms & Data Privacy Act Consent Modal */}
      <TermsPrivacyModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        submitLabel="I Agree & Continue"
        onAccept={async () => {
          setIsSubmittingConsent(true);
          try {
            await resolver.request('/api/auth/consent', {
              method: 'POST',
              data: { consent: true, termsVersion: '2026-v1.0' }
            });
            setIsConsentModalOpen(false);
            if (cart.length > 0) {
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
              navigate('/orders');
            }
          } catch (consentErr: any) {
            alert(consentErr.message || 'Failed to record consent');
          } finally {
            setIsSubmittingConsent(false);
          }
        }}
        isSubmitting={isSubmittingConsent}
      />
    </div>
  );
};
