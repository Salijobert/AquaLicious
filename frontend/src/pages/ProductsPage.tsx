import React, { useState, useEffect } from 'react';
import { useProducts, useOrders } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Search, ShoppingCart, Droplet, ShieldCheck, Award,
  Truck, Clock, MapPin, Phone, CheckCircle2,
  Smartphone, Minus, Check, Plus
} from 'lucide-react';
import { PageLoadingSpinner } from '../components/RouteGuards.js';
import { BottleGraphic } from '../components/WaterBottleGraphics.js';
import { AboutStationModal } from '../components/AboutStationModal.js';
import { CustomerAppModal } from '../components/CustomerAppModal.js';
import { COPY } from '../constants/copy.js';
import { isCapacitorApp } from '../utils/platform.js';
import { formatPeso } from '../utils/currency.js';

interface ProductsPageProps {
  onAddToCart?: (product: any, quantity?: number) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onAddToCart }) => {
  const { user, role, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = role === 'Administrator';
  const isCapacitor = isCapacitorApp();

  // If signed-in Administrator opens storefront, redirect immediately to dashboard (no flash)
  if (isLoading) {
    return <PageLoadingSpinner />;
  }
  if (isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Load products (customer storefront always shows active products only, even for Admin)
  const { data: products, error } = useProducts(false);
  const { data: customerOrders } = useOrders(undefined, { enabled: Boolean(user) });

  // Filter & Search
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Per-product quantity selector
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [addedAnimation, setAddedAnimation] = useState<number | null>(null);
  const [quickAddedKey, setQuickAddedKey] = useState<string | null>(null);

  // Modals
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);

  useEffect(() => {
    document.title = 'AquaLicious - Products';
  }, []);

  const categories = ['All', 'Slim', 'Round', 'Purified', 'Mineral'];

  const filteredProducts = products?.filter((p: any) => {
    const matchesCat = activeCategory === 'All' ? true : p.category === activeCategory;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesCat && matchesSearch;
  });

  const getQty = (id: number) => quantities[id] || 1;
  const setQty = (id: number, val: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));
  };

  // Add to Cart: If guest, redirect to /login and return back after authentication
  const handleAddToCart = (product: any) => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    const qty = getQty(product.id);
    if (onAddToCart) {
      onAddToCart(product, qty);
      setAddedAnimation(product.id);
      setTimeout(() => setAddedAnimation(null), 1200);
    }
  };

  const handleQuickRefill = (targetKey: 'SLIM_REFILL' | 'ROUND_REFILL' | 'SLIM_CONTAINER' | 'ROUND_CONTAINER') => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }

    const candidateMatchers: Record<string, ((p: any) => boolean)[]> = {
      SLIM_REFILL: [
        (p: any) => p.sku === 'REF-SLIM-5GAL',
        (p: any) => (p.name?.toLowerCase().includes('refill') || p.sku?.toLowerCase().includes('ref')) && (p.volume_label?.toLowerCase().includes('slim') || p.name?.toLowerCase().includes('slim')),
        (p: any) => p.name?.toLowerCase().includes('mineral refill'),
        (p: any) => p.name?.toLowerCase().includes('refill')
      ],
      ROUND_REFILL: [
        (p: any) => p.sku === 'REF-ROUND-5GAL',
        (p: any) => (p.name?.toLowerCase().includes('refill') || p.sku?.toLowerCase().includes('ref')) && (p.volume_label?.toLowerCase().includes('round') || p.name?.toLowerCase().includes('round')),
        (p: any) => p.sku === 'REF-SLIM-5GAL',
        (p: any) => p.name?.toLowerCase().includes('mineral refill'),
        (p: any) => p.name?.toLowerCase().includes('refill')
      ],
      SLIM_CONTAINER: [
        (p: any) => p.sku === 'NEW-SLIM-5GAL',
        (p: any) => p.name?.toLowerCase().includes('slim') && (p.name?.toLowerCase().includes('bottle') || p.name?.toLowerCase().includes('container') || p.name?.toLowerCase().includes('water')),
        (p: any) => p.sku?.toLowerCase().includes('slim')
      ],
      ROUND_CONTAINER: [
        (p: any) => p.sku === 'NEW-ROUND-5GAL',
        (p: any) => p.name?.toLowerCase().includes('round') && (p.name?.toLowerCase().includes('bottle') || p.name?.toLowerCase().includes('container') || p.name?.toLowerCase().includes('water')),
        (p: any) => p.sku?.toLowerCase().includes('round')
      ]
    };

    const matchers = candidateMatchers[targetKey] || [];
    let match: any = null;
    for (const matcher of matchers) {
      const found = products?.find(matcher);
      if (found) {
        match = found;
        break;
      }
    }

    if (!match) {
      alert('This refill product is currently not available in station inventory.');
      return;
    }

    if (match.stock <= 0) {
      alert(`${match.name} is currently out of stock.`);
      return;
    }

    if (onAddToCart) {
      onAddToCart(match, 1);
      setAddedAnimation(match.id);
      setQuickAddedKey(targetKey);
      setTimeout(() => {
        setAddedAnimation(null);
        setQuickAddedKey(null);
      }, 1500);
    }
  };

  // Active customer order (if logged in)
  const activeOrder = customerOrders?.find((o: any) =>
    o.status === 'PENDING' || o.status === 'ACCEPTED' || o.status === 'PREPARING' || o.status === 'READY_FOR_PICKUP' || o.status === 'OUTFORDELIVERY'
  );

  return (
    <main id="main-content" className="space-y-8 pt-4 pb-16 max-w-7xl mx-auto px-4 sm:px-8">
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      {/* Customer Storefront View */}
      <div className="space-y-10">
          {/* 1. HERO & WATER STATION SHOWCASE */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#e3f2fd] via-[#f0f7ff] to-white border border-[#bbdefb] p-6 sm:p-10 shadow-sm">
            <div className="relative z-10 max-w-3xl space-y-4">
              {/* Trust Pills (Generic, no fake certs) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2e7d32]/10 text-[#2e7d32] border border-[#2e7d32]/20 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#2e7d32] animate-pulse"></span>
                  {COPY.STOREFRONT.STATUS_OPEN}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1565c0]/10 text-[#1565c0] border border-[#1565c0]/20 text-xs font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" /> {COPY.STOREFRONT.STATUS_PURITY}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#0b3d91] border border-[#cfd8dc] text-xs font-bold shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#1e88e5]" /> {COPY.STOREFRONT.STATUS_SERVICE}
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0b3d91] leading-tight tracking-tight">
                {COPY.STOREFRONT.HERO_HEADLINE}
              </h1>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
                {COPY.STOREFRONT.HERO_SUBTEXT}
              </p>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('products-catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#1565c0] hover:bg-[#0b3d91] text-white shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Droplet className="w-4 h-4 fill-white" /> {COPY.STOREFRONT.ORDER_CTA}
                </button>
                <button
                  onClick={() => setIsAboutModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-[#1565c0] hover:bg-[#e3f2fd] border border-[#bbdefb] shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Award className="w-4 h-4" /> {COPY.STOREFRONT.ABOUT_CTA}
                </button>
                {!isCapacitor && (
                  <button
                    onClick={() => setIsAppModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#e3f2fd] text-[#0b3d91] hover:bg-[#bbdefb] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-[#1e88e5]" /> {COPY.STOREFRONT.APP_CTA}
                  </button>
                )}
              </div>

              {/* Station Info Quick Bar */}
              <div className="pt-3 border-t border-[#bbdefb]/60 flex flex-wrap items-center gap-y-2 gap-x-6 text-[11px] text-slate-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#1565c0]" />
                  <span>{COPY.STOREFRONT.CONTACT_HOTLINE}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#1565c0]" />
                  <span>{COPY.STOREFRONT.CONTACT_HUB}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#1565c0]" />
                  <span>{COPY.STOREFRONT.CONTACT_HOURS}</span>
                </div>
              </div>
            </div>

            {/* Decorative Shape */}
            <div className="hidden lg:block absolute -right-6 -bottom-10 w-96 h-96 opacity-15 pointer-events-none">
              <svg viewBox="0 0 100 100" className="w-full h-full fill-[#1565c0]">
                <path d="M50 0 C40 25 15 50 15 72 A35 35 0 0 0 85 72 C85 50 60 25 50 0 Z" />
              </svg>
            </div>
          </section>

          {/* 2. FAST REFILL & ACTIVE DELIVERY CARDS */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1-Click Fast Refill Reorder Bar */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-[#e3f2fd] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#e3f2fd] text-[#1565c0] flex items-center justify-center font-black text-xs">
                      ⚡
                    </span>
                    <h2 className="text-base font-bold text-[#0b3d91]">{COPY.STOREFRONT.QUICK_REFILL_TITLE}</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{COPY.STOREFRONT.QUICK_REFILL_SUBTEXT}</p>
                </div>
                <span className="text-[11px] font-bold text-[#1565c0] bg-[#e3f2fd] px-2.5 py-1 rounded-full">
                  Quick Add
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Slim Refill */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f8fbfe] to-[#eef6fc] border border-[#e3f2fd] flex items-center justify-between gap-3 hover:border-[#90caf9] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 shrink-0">
                      <BottleGraphic category="Slim" name="Slim Refill" className="w-12 h-12" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0b3d91]">5-Gal Slim Refill</div>
                      <div className="text-[11px] text-slate-500">Purified Mineral Water</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickRefill('SLIM_REFILL')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 shrink-0 ${
                      quickAddedKey === 'SLIM_REFILL'
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-[#1565c0] hover:bg-[#0b3d91] text-white'
                    }`}
                    title="Quick Add 5-Gal Slim Refill"
                  >
                    {quickAddedKey === 'SLIM_REFILL' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </>
                    )}
                  </button>
                </div>

                {/* Round Refill */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f8fbfe] to-[#eef6fc] border border-[#e3f2fd] flex items-center justify-between gap-3 hover:border-[#90caf9] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 shrink-0">
                      <BottleGraphic category="Round" name="Round Refill" className="w-12 h-12" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0b3d91]">5-Gal Round Refill</div>
                      <div className="text-[11px] text-slate-500">Water Dispenser Bottle</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickRefill('ROUND_REFILL')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 shrink-0 ${
                      quickAddedKey === 'ROUND_REFILL'
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-[#1565c0] hover:bg-[#0b3d91] text-white'
                    }`}
                    title="Quick Add 5-Gal Round Refill"
                  >
                    {quickAddedKey === 'ROUND_REFILL' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </>
                    )}
                  </button>
                </div>

                {/* Slim with Container */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f8fbfe] to-[#eef6fc] border border-[#e3f2fd] flex items-center justify-between gap-3 hover:border-[#90caf9] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 shrink-0">
                      <BottleGraphic category="Slim" name="Slim Container" className="w-12 h-12" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0b3d91]">Slim + Container</div>
                      <div className="text-[11px] text-slate-500">New Reusable Bottle</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickRefill('SLIM_CONTAINER')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 shrink-0 ${
                      quickAddedKey === 'SLIM_CONTAINER'
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-white text-[#1565c0] hover:bg-[#e3f2fd] border border-[#bbdefb]'
                    }`}
                    title="Add New Slim Container"
                  >
                    {quickAddedKey === 'SLIM_CONTAINER' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Bottle
                      </>
                    )}
                  </button>
                </div>

                {/* Round with Container */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f8fbfe] to-[#eef6fc] border border-[#e3f2fd] flex items-center justify-between gap-3 hover:border-[#90caf9] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 shrink-0">
                      <BottleGraphic category="Round" name="Round Container" className="w-12 h-12" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0b3d91]">Round + Container</div>
                      <div className="text-[11px] text-slate-500">Cooler Dispenser Jug</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickRefill('ROUND_CONTAINER')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 shrink-0 ${
                      quickAddedKey === 'ROUND_CONTAINER'
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-white text-[#1565c0] hover:bg-[#e3f2fd] border border-[#bbdefb]'
                    }`}
                    title="Add New Round Container"
                  >
                    {quickAddedKey === 'ROUND_CONTAINER' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Bottle
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Order Tracker */}
            <div className="bg-white rounded-3xl p-6 border border-[#e3f2fd] shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#1565c0]" />
                    <h3 className="text-sm font-bold text-[#0b3d91]">Order Status</h3>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-[#2e7d32] bg-[#e8f5e9] px-2 py-0.5 rounded-full">
                    {user ? 'Account' : 'Tracking'}
                  </span>
                </div>

                {user ? (
                  activeOrder ? (
                    <div className="space-y-3 p-3.5 rounded-2xl bg-[#f5f9ff] border border-[#bbdefb]">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-[#1565c0]">#{activeOrder.order_number}</span>
                        <span className="badge badge-warning text-[10px] font-bold">
                          {activeOrder.status}
                        </span>
                      </div>

                      <div className="pt-2 pb-1">
                        <div className="grid grid-cols-4 gap-1 text-center text-[9px] font-bold mb-1">
                          <span className="text-[#1565c0]">Placed</span>
                          <span className={activeOrder.status !== 'PENDING' ? 'text-[#1565c0]' : 'text-slate-300'}>
                            Processing
                          </span>
                          <span className={activeOrder.status === 'READY_FOR_PICKUP' || activeOrder.status === 'OUTFORDELIVERY' || activeOrder.status === 'COMPLETED' ? 'text-[#1565c0]' : 'text-slate-300'}>
                            Ready
                          </span>
                          <span className={activeOrder.status === 'COMPLETED' ? 'text-[#2e7d32]' : 'text-slate-300'}>
                            Done
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                          <div
                            className="bg-[#1565c0] h-full transition-all duration-500"
                            style={{
                              width:
                                activeOrder.status === 'COMPLETED'
                                  ? '100%'
                                  : activeOrder.status === 'READY_FOR_PICKUP' || activeOrder.status === 'OUTFORDELIVERY'
                                  ? '75%'
                                  : activeOrder.status === 'ACCEPTED' || activeOrder.status === 'PREPARING'
                                  ? '50%'
                                  : '25%'
                            }}
                          ></div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 flex justify-between pt-1">
                        <span>Fulfillment: <strong>{activeOrder.fulfillment}</strong></span>
                        <span>Total: <strong className="text-[#0b3d91]">{formatPeso(activeOrder.expected_total || 0)}</strong></span>
                      </div>

                      <Link
                        to="/orders"
                        className="w-full py-2 rounded-xl bg-[#1565c0] hover:bg-[#0b3d91] text-white text-xs font-bold text-center block transition-all shadow-xs"
                      >
                        View Order Details
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center py-6 px-3 bg-[#f5f7fa] rounded-2xl border border-[#eceff1] space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-[#2e7d32] mx-auto opacity-75" />
                      <div className="text-xs font-bold text-slate-800">No active orders</div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Place a refill order below for pickup or delivery.
                      </p>
                      <Link
                        to="/orders"
                        className="inline-block text-[11px] font-bold text-[#1565c0] hover:underline pt-1"
                      >
                        View Past Orders →
                      </Link>
                    </div>
                  )
                ) : (
                  <div className="text-center py-6 px-3 bg-[#f5f7fa] rounded-2xl border border-[#eceff1] space-y-3">
                    <Droplet className="w-7 h-7 text-[#1565c0] mx-auto" />
                    <div>
                      <div className="text-xs font-bold text-[#0b3d91]">Real-Time Order Tracking</div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-tight">
                        Sign in to monitor order progress, save delivery details, and view past orders.
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Link
                        to="/login"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1565c0] text-white hover:bg-[#0b3d91]"
                      >
                        Log In
                      </Link>
                      <Link
                        to="/register"
                        data-action="register"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb]"
                      >
                        Register
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-gradient-to-r from-[#e3f2fd] to-[#f5f7fa] rounded-2xl border border-[#bbdefb] flex items-center gap-2 text-xs text-[#0b3d91]">
                <ShieldCheck className="w-4 h-4 text-[#1565c0] shrink-0" />
                <span className="text-[11px]">Filtered mineral drinking water delivered to your doorstep.</span>
              </div>
            </div>
          </section>

          {/* 3. WATER PURIFICATION WALKTHROUGH (Generic & Factual) */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-[#e3f2fd] shadow-xs space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-1">
              <span className="text-[11px] font-bold text-[#1565c0] uppercase tracking-wider bg-[#e3f2fd] px-3 py-0.5 rounded-full">
                {COPY.STOREFRONT.PROCESS_TAG}
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#0b3d91]">
                {COPY.STOREFRONT.PROCESS_TITLE}
              </h2>
              <p className="text-xs text-slate-500">
                {COPY.STOREFRONT.PROCESS_SUBTEXT}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {COPY.STOREFRONT.PROCESS_STEPS.map((s) => (
                <div key={s.step} className="p-4 rounded-2xl bg-[#f5f7fa] border border-[#eceff1] space-y-2 relative">
                  <div className="w-8 h-8 rounded-xl bg-[#1565c0] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {s.step}
                  </div>
                  <div className="text-xs font-bold text-[#0b3d91]">{s.title}</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 4. PRODUCT CATALOG GRID SECTION */}
          <section id="products-catalog" className="space-y-6 pt-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#e3f2fd] pb-4">
              <div>
                <span className="text-[11px] font-bold text-[#1565c0] uppercase tracking-wider">
                  Store Catalog
                </span>
                <h2 className="text-2xl font-serif font-bold text-[#0b3d91] tracking-tight">
                  {COPY.STOREFRONT.CATALOG_TITLE}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {COPY.STOREFRONT.CATALOG_SUBTEXT}
                </p>
              </div>

              {/* Search Bar */}
              <div className="w-full md:w-72 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={COPY.STOREFRONT.SEARCH_PLACEHOLDER}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1565c0] focus:ring-1 focus:ring-[#1565c0] transition-all"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {categories.map((cat) => {
                const count =
                  cat === 'All'
                    ? products?.length || 0
                    : products?.filter((p: any) => p.category === cat).length || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                      activeCategory === cat
                        ? 'bg-[#1565c0] text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-[#e3f2fd] hover:text-[#1565c0] border border-[#eceff1]'
                    }`}
                  >
                    <span>{cat === 'All' ? '🌟 All Products' : cat}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        activeCategory === cat
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Product Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredProducts && filteredProducts.length > 0 ? (
                filteredProducts.map((product: any) => {
                  const qty = getQty(product.id);
                  const isOutOfStock = product.stock <= 0;
                  const isLowStock = product.stock > 0 && product.stock <= (product.reorder_pt || 20);
                  const isJustAdded = addedAnimation === product.id;

                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-3xl p-5 border border-[#e3f2fd] hover:border-[#90caf9] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Container Graphic Illustration */}
                        <div className="mb-4">
                          <BottleGraphic
                            category={product.category}
                            name={product.name}
                            className="w-full h-36"
                          />
                        </div>

                        {/* Badges Row */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold text-[#1565c0] bg-[#e3f2fd] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            {product.category || 'Water'}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isOutOfStock
                                ? 'bg-red-50 text-red-700 border border-red-200 font-bold'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-green-50 text-green-700 border border-green-200'
                            }`}
                          >
                            {isOutOfStock
                              ? 'Out of Stock'
                              : isLowStock
                              ? `Low Stock (${product.stock})`
                              : `In Stock (${product.stock})`}
                          </span>
                        </div>

                        <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-[#1565c0] transition-colors">
                          {product.name}{product.volume_label ? ` · ${product.volume_label}` : ''}
                        </h3>
                        <div className="text-[11px] text-slate-600 mt-0.5 font-mono font-medium">
                          {product.sku} · {product.volume_label || '5-Gallon'}
                        </div>

                        <div className="mt-2 text-[10px] text-slate-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#2e7d32]" />
                          <span>Clean & Refreshing</span>
                        </div>

                        <div className="mt-3 flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-[#0b3d91]">
                            {formatPeso(product.selling_price)}
                          </span>
                          <span className="text-[11px] text-slate-600 font-semibold">/ unit</span>
                        </div>
                      </div>

                      {/* Quantity Selector & Add to Cart */}
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-600">Quantity:</span>
                          <div className="flex items-center border border-slate-200 rounded-xl bg-[#f8fbfe]">
                            <button
                              onClick={() => setQty(product.id, qty - 1)}
                              disabled={qty <= 1 || isOutOfStock}
                              className="px-2.5 py-1 text-slate-600 hover:text-[#1565c0] disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-3 font-bold text-slate-800 text-xs font-mono">{qty}</span>
                            <button
                              onClick={() => setQty(product.id, qty + 1)}
                              disabled={qty >= product.stock || isOutOfStock}
                              className="px-2.5 py-1 text-slate-600 hover:text-[#1565c0] disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {onAddToCart && (
                          <button
                            data-action="add"
                            data-id={product.id}
                            onClick={() => handleAddToCart(product)}
                            disabled={isOutOfStock}
                            className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all ${
                              isJustAdded
                                ? 'bg-[#2e7d32] text-white'
                                : isOutOfStock
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-[#1565c0] hover:bg-[#0b3d91] text-white hover:shadow-md'
                            }`}
                          >
                            {isJustAdded ? (
                              <>
                                <Check className="w-4 h-4" /> Added to Cart!
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-4 h-4" />
                                <span>Add {qty > 1 ? `${qty} ` : ''}to Cart · {formatPeso(Number(product.selling_price) * qty)}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 space-y-3">
                  <Droplet className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="text-sm font-bold text-slate-600">No products match your search.</div>
                  <button
                    onClick={() => {
                      setActiveCategory('All');
                      setSearchQuery('');
                    }}
                    className="text-xs font-bold text-[#1565c0] hover:underline"
                  >
                    Clear filters and view all
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 5. CUSTOMER APP BANNER (Hidden on native APK) */}
          {!isCapacitor && (
            <section className="bg-gradient-to-r from-[#0b3d91] via-[#1565c0] to-[#1e88e5] text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
              <div className="space-y-2 text-center md:text-left">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/80 bg-white/20 px-3 py-0.5 rounded-full inline-block">
                  AquaLicious Mobile Android App
                </span>
                <h2 className="text-2xl font-serif font-bold tracking-tight">
                  Order Water From Your Phone Anytime
                </h2>
                <p className="text-xs sm:text-sm text-white/90 max-w-lg">
                  Order refills, track delivery status, and pay with GCash or Maya from your Android device.
                </p>
              </div>
              <button
                onClick={() => setIsAppModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-white text-[#0b3d91] hover:bg-[#e3f2fd] font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
              >
                <Smartphone className="w-4 h-4 text-[#1565c0]" /> Download Android APK
              </button>
            </section>
          )}

          {/* 6. STOREFRONT FOOTER */}
          <footer className="pt-8 border-t border-[#e3f2fd] text-slate-500 text-xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 font-serif font-bold text-[#0b3d91] text-base mb-2">
                  <Droplet className="w-4 h-4 text-[#1565c0] fill-[#1565c0]" /> AquaLicious
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Providing fresh, clean drinking water to homes and businesses with pickup and delivery options.
                </p>
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-2">Quality & Service</div>
                <ul className="space-y-1 text-[11px]">
                  <li>• Clean Mineral Drinking Water</li>
                  <li>• Regular Filter Maintenance</li>
                  <li>• Washed & Sealed Containers</li>
                  <li>• Doorstep Delivery & Station Pickup</li>
                </ul>
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-2">Station Information</div>
                <div className="text-[11px] space-y-1">
                  <div>Schedule: <strong>{COPY.ABOUT.HOURS}</strong></div>
                  <div>Service: <strong>{COPY.ABOUT.ADDRESS}</strong></div>
                  <div className="pt-1 text-[#1565c0] font-semibold">{COPY.ABOUT.EMAIL}</div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-slate-600">
              <div>© 2026 AquaLicious Water Refilling Station. All rights reserved.</div>
              <div>Pure · Safe · Refreshed</div>
            </div>
          </footer>
        </div>

      {/* Reusable Modals */}
      <AboutStationModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
      <CustomerAppModal isOpen={isAppModalOpen} onClose={() => setIsAppModalOpen(false)} />
    </main>
  );
};
