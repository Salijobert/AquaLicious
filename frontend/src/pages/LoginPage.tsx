import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Droplet, Lock, User, AlertCircle, Smartphone, ShieldCheck, Zap, Truck } from 'lucide-react';
import { COPY } from '../constants/copy.js';
import { isCapacitorApp } from '../utils/platform.js';

export const LoginPage: React.FC = () => {
  const { user, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isCapacitor = isCapacitorApp();

  // Redirect signed-in users away from login immediately
  useEffect(() => {
    document.title = 'AquaLicious - Login';

    try {
      const notice = sessionStorage.getItem('aq_auth_notice');
      if (notice) {
        setError(notice);
        sessionStorage.removeItem('aq_auth_notice');
      }
    } catch {}

    if (!authLoading && user) {
      if (user.role === 'Administrator') {
        navigate('/dashboard', { replace: true });
      } else if (user.role === 'Customer') {
        if (user.email_verified) {
          navigate('/', { replace: true });
        } else {
          navigate('/verify-email', { replace: true });
        }
      }
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const userProfile = await login(username, password);
      const isAdmin = userProfile.role === 'Administrator';

      // Check if customer email is not verified
      if (!isAdmin && !userProfile.email_verified) {
        navigate('/verify-email', { replace: true });
        return;
      }

      // Check if user was previously redirected from a protected route
      const destination = (location.state as any)?.from?.pathname;
      if (destination && !destination.includes('/login') && !destination.includes('/register')) {
        const isAdminRoute =
          destination.startsWith('/dashboard') ||
          destination.startsWith('/sales') ||
          destination.startsWith('/inventory') ||
          destination.startsWith('/admin/products') ||
          destination.startsWith('/reports') ||
          destination.startsWith('/users');

        if (!isAdmin && isAdminRoute) {
          navigate('/', { replace: true });
        } else {
          navigate(destination, { replace: true });
        }
      } else {
        // Default role-based landing
        if (isAdmin) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

  // If already authenticated and redirecting, return null to avoid flash
  if (user) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-white text-slate-700 flex flex-col font-sans"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(1.5rem + var(--safe-bottom))'
      }}
    >
      {/* ─── MOBILE COMPACT BRAND HEADER (< 768px / lg:hidden) ─── */}
      <header
        id="mobile-brand-header"
        className="lg:hidden w-full flex flex-col items-center justify-center text-center px-4 relative overflow-hidden shadow-sm"
        style={{
          height: 'clamp(120px, 18vh, 160px)',
          background: 'linear-gradient(135deg, #0b3d91 0%, #1565c0 50%, #1e88e5 100%)'
        }}
      >
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_30%_30%,white_0%,transparent_70%)]" />
        <div className="relative z-10 flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <Droplet className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-serif text-2xl sm:text-3xl font-bold text-white tracking-widest drop-shadow-sm">
            AQUALICIOUS
          </span>
        </div>
        <div className="relative z-10 text-[10px] sm:text-xs font-semibold text-white/90 uppercase tracking-widest">
          Pure · Safe · Refreshed
        </div>
      </header>

      <main id="main-content" className="flex-1 flex flex-col justify-center">
        {/* ─── HERO & LOGIN SECTION ─── */}
        <section className="pt-3 lg:pt-8 pb-12 lg:pb-16 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto w-full flex-1 flex flex-col lg:grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          
          {/* Column A (Desktop Left, Mobile Second): Pitch, Benefits, APK Banner */}
          <div className="order-2 lg:order-1 space-y-6 w-full max-w-md lg:max-w-none mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e3f2fd] text-[#1565c0] text-xs font-bold tracking-wide">
              <Droplet className="w-3.5 h-3.5 fill-[#1565c0]" /> {COPY.LOGIN.HERO_TAG}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[3.2rem] text-[#0b3d91] font-bold leading-tight">
              {COPY.LOGIN.HERO_HEADLINE}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
              {COPY.LOGIN.HERO_SUBTEXT}
            </p>

            {/* Customer Benefit Chips */}
            <div className="grid grid-cols-3 gap-3 pt-2 max-w-md">
              <div className="p-3 bg-[#f5f7fa] rounded-xl border border-[#eceff1] text-center">
                <ShieldCheck className="w-5 h-5 text-[#1565c0] mx-auto mb-1" />
                <div className="text-[11px] font-bold text-[#0b3d91]">{COPY.LOGIN.BENEFITS[0].title}</div>
                <div className="text-[9px] text-slate-600 font-medium">{COPY.LOGIN.BENEFITS[0].sub}</div>
              </div>
              <div className="p-3 bg-[#f5f7fa] rounded-xl border border-[#eceff1] text-center">
                <Zap className="w-5 h-5 text-[#1565c0] mx-auto mb-1" />
                <div className="text-[11px] font-bold text-[#0b3d91]">{COPY.LOGIN.BENEFITS[1].title}</div>
                <div className="text-[9px] text-slate-600 font-medium">{COPY.LOGIN.BENEFITS[1].sub}</div>
              </div>
              <div className="p-3 bg-[#f5f7fa] rounded-xl border border-[#eceff1] text-center">
                <Truck className="w-5 h-5 text-[#2e7d32] mx-auto mb-1" />
                <div className="text-[11px] font-bold text-[#0b3d91]">{COPY.LOGIN.BENEFITS[2].title}</div>
                <div className="text-[9px] text-slate-600 font-medium">{COPY.LOGIN.BENEFITS[2].sub}</div>
              </div>
            </div>

            {/* Customer Android App Promotion Banner (Hidden inside Capacitor APK) */}
            {!isCapacitor && (
              <div id="app" className="p-4 bg-gradient-to-r from-[#e3f2fd] to-[#f5f7fa] rounded-2xl border border-[#bbdefb] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1565c0] text-white rounded-xl flex items-center justify-center shadow">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0b3d91]">{COPY.LOGIN.APK_BANNER_TITLE}</div>
                    <div className="text-[11px] text-slate-600">{COPY.LOGIN.APK_BANNER_SUBTEXT}</div>
                  </div>
                </div>
                <a
                  href="/deliverables/AquaLicious-release.apk"
                  download
                  className="px-3.5 py-2 bg-[#1565c0] text-white text-[11px] font-bold rounded-xl hover:bg-[#0b3d91] shadow transition-all whitespace-nowrap"
                >
                  {COPY.LOGIN.APK_BUTTON_TEXT}
                </a>
              </div>
            )}
          </div>

          {/* Column B (Desktop Right, Mobile First): Water Orb & Login Form */}
          <div className="order-1 lg:order-2 flex flex-col items-center justify-center gap-6 lg:gap-8 w-full max-w-md mx-auto">
            {/* Animated Morphing Water Orb (Desktop Only) */}
            <div className="hidden lg:block">
              <div className="water-orb shadow-2xl">
                <div className="text-4xl z-10 mb-2">💧</div>
                <div className="font-serif text-2xl font-bold text-white tracking-widest z-10">
                  AQUALICIOUS
                </div>
                <div className="text-[11px] font-semibold text-white/80 z-10 uppercase tracking-wider mt-1">
                  Pure · Safe · Refreshed
                </div>
              </div>
            </div>

            {/* AquaLicious Login Card */}
            <div
              id="login-box"
              className="w-full bg-white p-5 sm:p-7 rounded-2xl shadow-[0_8px_40px_rgba(21,101,192,0.13)] border border-[#eceff1]"
            >
              <div className="text-center mb-5">
                <h2 className="font-serif text-xl font-bold text-[#0b3d91]">{COPY.LOGIN.CARD_TITLE}</h2>
                <p className="text-xs text-slate-600 mt-1">{COPY.LOGIN.CARD_SUBTITLE}</p>
              </div>

              {error && (
                <div className="bg-[#fff3f3] text-[#c62828] border border-[#ffcdd2] rounded-xl p-3 text-xs mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#455a64] mb-1.5">{COPY.LOGIN.USERNAME_LABEL}</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-3 text-[#78909c]" />
                    <input
                      type="text"
                      name="username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                      placeholder={COPY.LOGIN.USERNAME_PLACEHOLDER}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-[#455a64] mb-0">{COPY.LOGIN.PASSWORD_LABEL}</label>
                    <Link
                      to="/forgot-password"
                      className="text-[11px] font-semibold text-[#1565c0] hover:underline"
                    >
                      {COPY.LOGIN.FORGOT_PASSWORD_LINK}
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-[#78909c]" />
                    <input
                      type="password"
                      name="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                      placeholder={COPY.LOGIN.PASSWORD_PLACEHOLDER}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-[#1565c0] hover:bg-[#0b3d91] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all mt-2"
                >
                  {isLoading ? COPY.LOGIN.SUBMIT_BUTTON_LOADING : COPY.LOGIN.SUBMIT_BUTTON}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-[#eceff1] text-center flex flex-col gap-1.5 text-xs">
                <Link to="/register" data-action="register" className="text-[#1565c0] hover:underline font-semibold">
                  {COPY.LOGIN.REGISTER_PROMPT}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#0b3d91] text-white/70 py-6 text-center text-xs border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-[#1e88e5] fill-[#1e88e5]" />
            <span className="font-serif font-bold text-white">AquaLicious</span>
            <span>— Pure Mineral Water & Refilling Station</span>
          </div>
          <div>© 2026 AquaLicious. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};
