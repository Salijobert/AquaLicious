import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Droplet, User, Mail, AlertCircle, Smartphone, ShieldCheck, Zap, Truck, LogIn, UserPlus } from 'lucide-react';
import { COPY } from '../constants/copy.js';
import { isCapacitorApp } from '../utils/platform.js';
import { PasswordInput, PasswordInputHandle } from '../components/PasswordInput.js';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal.js';
import { getFriendlyErrorMessage } from '../utils/orderLabels.js';
import { TERMS_VERSION } from '../constants/terms.js';

type AuthMode = 'login' | 'register';
type RegisterState = 'idle' | 'consenting' | 'submitting' | 'done' | 'error';

export const LoginPage: React.FC = () => {
  const { user, login, register, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine initial mode from URL pathname or hash (supporting HashRouter in APK and BrowserRouter on Web)
  const isHashRegister = typeof window !== 'undefined' && window.location.hash.toLowerCase().includes('/register');
  const initialMode: AuthMode = (location.pathname.toLowerCase().includes('/register') || isHashRegister) ? 'register' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmation, setRegConfirmation] = useState('');

  // Common UI state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [regState, setRegState] = useState<RegisterState>('idle');
  const [regModalError, setRegModalError] = useState<string | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const isSubmittingRegRef = useRef(false);

  // Password refs for programmatically hiding passwords on mode change
  const loginPwRef = useRef<PasswordInputHandle>(null);
  const regPwRef = useRef<PasswordInputHandle>(null);
  const regConfRef = useRef<PasswordInputHandle>(null);

  // Tab button refs for ARIA arrow-key navigation
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const regTabRef = useRef<HTMLButtonElement>(null);

  const isCapacitor = isCapacitorApp();

  // Sync mode with URL location changes (e.g. browser back/forward buttons, hash changes in APK)
  useEffect(() => {
    const isReg =
      location.pathname.toLowerCase().includes('/register') ||
      (typeof window !== 'undefined' && window.location.hash.toLowerCase().includes('/register'));
    const targetMode: AuthMode = isReg ? 'register' : 'login';
    if (targetMode !== mode) {
      setMode(targetMode);
      setError(null);
      setLoginPassword('');
      setRegPassword('');
      setRegConfirmation('');
    }
  }, [location.pathname, location.hash]);

  // Document title and redirect authenticated users
  useEffect(() => {
    document.title = mode === 'register' ? 'AquaLicious - Register' : 'AquaLicious - Login';

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
  }, [user, authLoading, navigate, mode]);

  // Tab switching handler
  const handleModeSwitch = (newMode: AuthMode) => {
    if (newMode === mode) return;

    // Reset password inputs and error banners
    setLoginPassword('');
    setRegPassword('');
    setRegConfirmation('');
    loginPwRef.current?.hidePassword();
    regPwRef.current?.hidePassword();
    regConfRef.current?.hidePassword();
    setError(null);
    setRegModalError(null);
    setRegState('idle');
    setIsTermsOpen(false);

    setMode(newMode);
    navigate(newMode === 'register' ? '/register' : '/login');
  };

  // Keyboard navigation for tab list
  const handleTabKeyDown = (e: React.KeyboardEvent, currentTab: AuthMode) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentTab === 'login') {
        handleModeSwitch('register');
        regTabRef.current?.focus();
      } else {
        handleModeSwitch('login');
        loginTabRef.current?.focus();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentTab === 'register') {
        handleModeSwitch('login');
        loginTabRef.current?.focus();
      } else {
        handleModeSwitch('register');
        regTabRef.current?.focus();
      }
    }
  };

  // Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const userProfile = await login(loginUsername, loginPassword);
      const isAdmin = userProfile.role === 'Administrator';

      if (!isAdmin && !userProfile.email_verified) {
        navigate('/verify-email', { replace: true });
        return;
      }

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
        if (isAdmin) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Register form validation & proceed to Terms modal
  const handleRegisterFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = regName.trim();
    const cleanUsername = regUsername.trim();
    const cleanEmail = regEmail.trim().toLowerCase();

    if (!cleanName) {
      setError('Full name is required.');
      return;
    }

    if (!cleanUsername) {
      setError('Username is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('A valid email address is required for account verification.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (regPassword !== regConfirmation) {
      setError('Passwords do not match.');
      return;
    }

    // Pass validation, open mandatory Terms & Data Privacy modal
    setRegModalError(null);
    setRegState('consenting');
    setIsTermsOpen(true);
  };

  // Accept Terms & Execute Registration
  const handleAcceptTermsAndRegister = async (termsVersion: string) => {
    // Client-side guard against concurrent double-clicks or rapid taps
    if (isSubmittingRegRef.current || regState === 'submitting') {
      return;
    }
    isSubmittingRegRef.current = true;
    setRegState('submitting');
    setRegModalError(null);
    setIsLoading(true);

    const cleanEmail = regEmail.trim().toLowerCase();
    try {
      await register(regName.trim(), regUsername.trim(), regPassword, true, termsVersion, cleanEmail);
      setRegState('done');
      setIsTermsOpen(false);
      navigate('/verify-email', { replace: true });
    } catch (err: any) {
      const friendlyMsg = getFriendlyErrorMessage(err);
      setRegModalError(friendlyMsg);
      setRegState('error');
    } finally {
      setIsLoading(false);
      isSubmittingRegRef.current = false;
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
        className="lg:hidden w-full flex flex-col items-center justify-center text-center px-4 relative overflow-hidden shadow-sm shrink-0"
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
        {/* ─── HERO & AUTH SECTION ─── */}
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

          {/* Column B (Desktop Right, Mobile First): Water Orb & Combined Auth Card */}
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

            {/* Combined Auth Card with Segmented Control */}
            <div
              id="login-box"
              className="w-full bg-white p-5 sm:p-7 rounded-2xl shadow-[0_8px_40px_rgba(21,101,192,0.13)] border border-[#eceff1]"
            >
              <div className="text-center mb-4">
                <h2 className="font-serif text-xl font-bold text-[#0b3d91]">
                  {mode === 'login' ? COPY.LOGIN.CARD_TITLE : 'Create Customer Account'}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  {mode === 'login'
                    ? COPY.LOGIN.CARD_SUBTITLE
                    : 'Join AquaLicious for easy mineral water ordering & station refills'}
                </p>
              </div>

              {/* Segmented Tablist Control */}
              <div
                role="tablist"
                aria-label="Authentication Options"
                className="grid grid-cols-2 gap-1 p-1 bg-[#f0f4f8] rounded-xl mb-5 border border-[#e2e8f0]"
              >
                <button
                  ref={loginTabRef}
                  id="tab-login"
                  role="tab"
                  type="button"
                  aria-selected={mode === 'login'}
                  aria-controls="panel-login"
                  tabIndex={mode === 'login' ? 0 : -1}
                  onClick={() => handleModeSwitch('login')}
                  onKeyDown={(e) => handleTabKeyDown(e, 'login')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565c0] ${
                    mode === 'login'
                      ? 'bg-white text-[#1565c0] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In</span>
                </button>

                <button
                  ref={regTabRef}
                  id="tab-register"
                  role="tab"
                  type="button"
                  aria-selected={mode === 'register'}
                  aria-controls="panel-register"
                  tabIndex={mode === 'register' ? 0 : -1}
                  onClick={() => handleModeSwitch('register')}
                  onKeyDown={(e) => handleTabKeyDown(e, 'register')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565c0] ${
                    mode === 'register'
                      ? 'bg-white text-[#1565c0] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register</span>
                </button>
              </div>

              {/* Form Error Banner */}
              {error && (
                <div
                  role="alert"
                  className="bg-[#fff3f3] text-[#c62828] border border-[#ffcdd2] rounded-xl p-3 text-xs mb-4 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* ─── TAB PANEL 1: LOGIN ─── */}
              {mode === 'login' && (
                <div
                  id="panel-login"
                  role="tabpanel"
                  aria-labelledby="tab-login"
                >
                  <form id="auth-form" onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#455a64] mb-1.5">
                        {COPY.LOGIN.USERNAME_LABEL}
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3.5 top-3 text-[#78909c]" />
                        <input
                          type="text"
                          name="username"
                          required
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                          placeholder={COPY.LOGIN.USERNAME_PLACEHOLDER}
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-[#455a64] mb-0">
                          {COPY.LOGIN.PASSWORD_LABEL}
                        </label>
                        <Link
                          to="/forgot-password"
                          className="text-[11px] font-semibold text-[#1565c0] hover:underline"
                        >
                          {COPY.LOGIN.FORGOT_PASSWORD_LINK}
                        </Link>
                      </div>
                      <PasswordInput
                        ref={loginPwRef}
                        id="login-password"
                        name="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder={COPY.LOGIN.PASSWORD_PLACEHOLDER}
                        autoComplete="current-password"
                      />
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
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('register')}
                      data-action="register"
                      className="text-[#1565c0] hover:underline font-semibold text-center"
                    >
                      {COPY.LOGIN.REGISTER_PROMPT}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── TAB PANEL 2: REGISTER ─── */}
              {mode === 'register' && (
                <div
                  id="panel-register"
                  role="tabpanel"
                  aria-labelledby="tab-register"
                >
                  <form id="auth-form" onSubmit={handleRegisterFormSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#455a64] mb-1">Full Name *</label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                        placeholder="e.g. Maria Santos"
                        autoComplete="name"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#455a64] mb-1">Username *</label>
                      <input
                        type="text"
                        name="username"
                        required
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                        placeholder="Choose a username"
                        autoComplete="username"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#455a64] mb-1">Email Address *</label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#f5f7fa] border border-[#cfd8dc] rounded-xl text-slate-800 focus:outline-none focus:border-[#1e88e5] focus:bg-white transition-colors"
                        placeholder="e.g. maria@example.com (for verification)"
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <PasswordInput
                        ref={regPwRef}
                        id="reg-password"
                        name="password"
                        label="Password *"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <PasswordInput
                        ref={regConfRef}
                        id="reg-confirmation"
                        name="confirmation"
                        label="Confirm Password *"
                        required
                        minLength={6}
                        value={regConfirmation}
                        onChange={(e) => setRegConfirmation(e.target.value)}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 bg-[#1565c0] hover:bg-[#0b3d91] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all mt-2"
                    >
                      Continue to Terms & Privacy
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-[#eceff1] text-center flex flex-col gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('login')}
                      data-action="login"
                      className="text-[#1565c0] hover:underline font-semibold text-center"
                    >
                      Already have an account? Sign in here
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Mandatory Terms & Conditions + Data Privacy Consent Modal */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => {
          if (regState !== 'submitting') {
            setIsTermsOpen(false);
            setRegState('idle');
          }
        }}
        onAccept={handleAcceptTermsAndRegister}
        isSubmitting={regState === 'submitting'}
        submittingText="Creating your account..."
        submitLabel="Accept & Register"
        error={regModalError}
        onRetry={() => handleAcceptTermsAndRegister(TERMS_VERSION)}
      />

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#0b3d91] text-white/70 py-6 text-center text-xs border-t border-white/10 shrink-0">
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
