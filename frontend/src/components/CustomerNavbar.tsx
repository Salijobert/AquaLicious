import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Droplet, ShoppingCart, Smartphone, User, LogOut, Package, Menu, X, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { AboutStationModal } from './AboutStationModal.js';
import { CustomerAppModal } from './CustomerAppModal.js';
import { UpdateDiagnosticsModal } from './UpdateDiagnosticsModal.js';
import { isCapacitorApp } from '../utils/platform.js';
import { getRunningBundleVersion, checkAndApplyUpdate, BASE_APP_VERSION } from '../services/updater.js';

interface CustomerNavbarProps {
  cartCount?: number;
  onOpenCart?: () => void;
}

export const CustomerNavbar: React.FC<CustomerNavbarProps> = ({ cartCount = 0, onOpenCart }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAppOpen, setIsAppOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  const handleVersionTap = () => {
    const now = Date.now();
    if (now - lastTapTime > 3000) {
      setVersionTapCount(1);
    } else {
      const nextCount = versionTapCount + 1;
      setVersionTapCount(nextCount);
      if (nextCount >= 5) {
        setIsDiagnosticsOpen(true);
        setVersionTapCount(0);
      }
    }
    setLastTapTime(now);
  };

  const isCustomer = user?.role === 'Customer';
  const isAdmin = user?.role === 'Administrator';
  const path = location.pathname.toLowerCase();
  const isCapacitor = isCapacitorApp();

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMsg(null);
    try {
      const res = await checkAndApplyUpdate({ manual: true });
      if (res.status === 'up_to_date') {
        setUpdateStatusMsg("You're up to date.");
      } else if (res.status === 'update_ready') {
        setUpdateStatusMsg('Update downloaded. Restart to apply.');
      } else if (res.status === 'error') {
        setUpdateStatusMsg(res.message);
      } else if (res.status === 'native_update_required') {
        setUpdateStatusMsg('App update required. Please download the latest version. (UPD-APK-01)');
      }
    } catch {
      setUpdateStatusMsg('Update check failed. Please try again later. (UPD-GEN-01)');
    } finally {
      setIsCheckingUpdate(false);
      setTimeout(() => setUpdateStatusMsg(null), 4000);
    }
  };

  const handleLogout = async () => {
    try {
      queryClient.clear();
      await logout();
      navigate('/', { replace: true });
    } catch {
      navigate('/', { replace: true });
    }
  };

  const handleProductsClick = (e: React.MouseEvent) => {
    setIsMobileMenuOpen(false);
    const el = document.getElementById('products-catalog');
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#e3f2fd] shadow-[0_2px_12px_rgba(21,101,192,0.07)] flex items-center justify-between px-4 sm:px-8 md:px-12"
        style={{ paddingTop: 'var(--sat)', height: 'calc(4rem + var(--sat))' }}
      >
        {/* Brand Logo & Name: Always navigates to home ('/') */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-[#1565c0] group-hover:bg-[#0b3d91] rounded-full flex items-center justify-center shadow-sm transition-colors shrink-0">
              <Droplet className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="font-serif text-xl font-bold tracking-wide text-[#0b3d91]">
              AquaLicious
            </span>
          </Link>
          <span className="hidden lg:inline-block text-[11px] font-bold text-[#1565c0] bg-[#e3f2fd] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Water Station & Delivery
          </span>
        </div>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
          <Link
            to="/"
            onClick={handleProductsClick}
            className={`hover:text-[#1565c0] transition-colors ${path === '/' ? 'text-[#1565c0] font-bold' : ''}`}
          >
            Products
          </Link>
          <button
            onClick={() => setIsAboutOpen(true)}
            className="hover:text-[#1565c0] transition-colors cursor-pointer"
          >
            About Us
          </button>
          {!isCapacitor && (
            <button
              onClick={() => setIsAppOpen(true)}
              className="hover:text-[#0b3d91] transition-colors flex items-center gap-1.5 text-[#1565c0] cursor-pointer font-bold"
            >
              <Smartphone className="w-4 h-4 text-[#1565c0]" /> Customer App
            </button>
          )}
        </div>

        {/* Right Section: Cart & Auth Controls */}
        <div className="flex items-center gap-3">
          {/* Cart Icon Button - Shown only for authenticated users who can check out */}
          {user && onOpenCart && (
            <button
              data-id="cart"
              onClick={onOpenCart}
              className="w-9 h-9 rounded-full border border-[#cfd8dc] bg-white text-gray-700 flex items-center justify-center hover:border-[#1565c0] hover:text-[#1565c0] cursor-pointer relative transition-all"
              aria-label="Customer Cart"
              title="Customer Cart"
            >
              <ShoppingCart className="w-4 h-4 text-slate-700" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#1565c0] text-white text-[10px] font-bold flex items-center justify-center shadow">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {/* User Auth State */}
          {!user ? (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-bold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb] transition-all"
              >
                LOGIN
              </Link>
              <Link
                to="/register"
                data-action="register"
                className="px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-bold bg-[#1565c0] text-white hover:bg-[#0b3d91] shadow-sm transition-all"
              >
                REGISTER
              </Link>
            </div>
          ) : isCustomer ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/orders"
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  path === '/orders'
                    ? 'bg-[#1565c0] text-white shadow-sm'
                    : 'bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>My Orders</span>
              </Link>

              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f5f7fa] border border-[#eceff1] text-xs font-semibold text-[#0b3d91]">
                <User className="w-3.5 h-3.5 text-[#1565c0]" />
                <span className="max-w-[120px] truncate">{user.name || user.username}</span>
              </div>

              <button
                onClick={handleLogout}
                className="hidden md:flex px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all items-center gap-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : isAdmin ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#0b3d91] text-white hover:bg-[#1565c0] shadow-sm transition-all"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>

              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f5f7fa] border border-[#eceff1] text-xs font-semibold text-[#0b3d91]">
                <User className="w-3.5 h-3.5 text-[#1565c0]" />
                <span className="max-w-[120px] truncate">{user.name || user.username}</span>
              </div>

              <button
                onClick={handleLogout}
                className="hidden md:flex px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all items-center gap-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : null}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Toggle Navigation"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-[#1565c0]" /> : <Menu className="w-5 h-5 text-[#1565c0]" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-x-0 z-40 bg-white border-b border-[#e3f2fd] shadow-xl md:hidden px-6 py-5 space-y-4 animate-in slide-in-from-top-2 duration-150"
          style={{
            top: 'calc(4rem + var(--safe-top))',
            paddingBottom: 'max(var(--safe-bottom), 1.25rem)',
            maxHeight: 'calc(100dvh - 4rem - var(--safe-top))',
            overflowY: 'auto'
          }}
        >
          <div className="flex flex-col gap-3 text-sm font-semibold text-slate-700 border-b border-slate-100 pb-4">
            <Link
              to="/"
              onClick={handleProductsClick}
              className="py-1.5 text-slate-800 hover:text-[#1565c0] flex items-center justify-between"
            >
              <span>Products & Refills</span>
              <span className="text-[10px] bg-[#e3f2fd] text-[#1565c0] font-bold px-2 py-0.5 rounded-full">Store</span>
            </Link>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsAboutOpen(true);
              }}
              className="py-1.5 text-left text-slate-800 hover:text-[#1565c0] flex items-center justify-between cursor-pointer"
            >
              <span>About Us</span>
              <ShieldCheck className="w-4 h-4 text-[#2e7d32]" />
            </button>

            {!isCapacitor && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsAppOpen(true);
                }}
                className="py-1.5 text-left text-[#1e88e5] font-bold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Customer Android App
                </span>
                <span className="text-[10px] bg-[#1e88e5] text-white font-bold px-2 py-0.5 rounded-full">APK</span>
              </button>
            )}

            {isCustomer && (
              <Link
                to="/orders"
                onClick={() => setIsMobileMenuOpen(false)}
                className="py-1.5 text-slate-800 hover:text-[#1565c0] flex items-center justify-between font-bold"
              >
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-[#1565c0]" /> My Water Orders
                </span>
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="py-1.5 text-slate-800 hover:text-[#1565c0] flex items-center justify-between font-bold"
              >
                <span className="flex items-center gap-1.5">
                  <LayoutDashboard className="w-4 h-4 text-[#1565c0]" /> Admin Dashboard
                </span>
              </Link>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between">
            {user ? (
              <div className="flex items-center justify-between w-full">
                <div className="text-xs text-slate-600 font-semibold truncate max-w-[180px]">
                  👤 {user.name || user.username}
                </div>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 w-full">
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb]"
                >
                  LOGIN
                </Link>
                <Link
                  to="/register"
                  data-action="register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-[#1565c0] text-white hover:bg-[#0b3d91]"
                >
                  REGISTER
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Drawer Footer: In-app version & Update Check */}
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-1 text-[11px] text-slate-400">
            <div className="flex items-center justify-between">
              <span
                onClick={handleVersionTap}
                className="cursor-pointer select-none active:text-[#1565c0]"
                title="Tap 5 times for diagnostics"
              >
                Version {BASE_APP_VERSION} (bundle {getRunningBundleVersion()})
              </span>
              {isCapacitor && (
                <button
                  onClick={handleManualUpdateCheck}
                  disabled={isCheckingUpdate}
                  className="text-[#1565c0] font-bold hover:underline"
                >
                  {isCheckingUpdate ? 'Checking...' : 'Check for updates'}
                </button>
              )}
            </div>
            {updateStatusMsg && (
              <div className="text-[10px] text-center text-slate-500 font-medium flex items-center justify-center gap-1.5 flex-wrap">
                <span>{updateStatusMsg}</span>
                <button
                  onClick={() => setIsDiagnosticsOpen(true)}
                  className="text-[#1565c0] font-bold underline hover:text-[#0b3d91]"
                >
                  Details
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reusable Modals */}
      <AboutStationModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <CustomerAppModal isOpen={isAppOpen} onClose={() => setIsAppOpen(false)} />
      <UpdateDiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
    </>
  );
};
