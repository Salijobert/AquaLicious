import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Droplet } from 'lucide-react';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal.js';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('A valid email address is required for account verification');
      return;
    }

    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Open Terms & Conditions and Data Privacy Modal for mandatory consent
    setIsTermsOpen(true);
  };

  const handleAcceptTermsAndRegister = async (termsVersion: string) => {
    setIsLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await register(name.trim(), username.trim(), password, true, termsVersion, cleanEmail);
      setIsTermsOpen(false);
      navigate('/verify-email', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setIsTermsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-start sm:justify-center items-center"
      style={{
        background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)',
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(2rem + var(--safe-bottom))'
      }}
    >
      {/* ─── MOBILE COMPACT BRAND HEADER (< 640px / sm:hidden) ─── */}
      <header
        className="sm:hidden w-full flex flex-col items-center justify-center text-center px-4 relative overflow-hidden shadow-sm shrink-0"
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
          <span className="font-serif text-2xl font-bold text-white tracking-widest drop-shadow-sm">
            AQUALICIOUS
          </span>
        </div>
        <div className="relative z-10 text-[10px] font-semibold text-white/90 uppercase tracking-widest">
          Pure · Safe · Refreshed
        </div>
      </header>

      <main id="main-content" className="w-full max-w-md px-4 mt-3 sm:mt-0 flex-1 flex flex-col justify-center">
        <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-6 sm:p-8">
          <div className="text-center mb-5">
            <div className="hidden sm:flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-[#1565c0] flex items-center justify-center text-white shadow-md">
                <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                  <path d="M12 2C8 7 4 10.5 4 14a8 8 0 0016 0c0-3.5-4-7-8-12z" />
                </svg>
              </div>
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#0b3d91] tracking-tight">
              Create Customer Account
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Join AquaLicious for easy mineral water ordering & station refills
            </p>
          </div>

          {error && (
            <div className="p-3 mb-4 bg-red-50 text-red-700 rounded-lg text-xs flex items-center gap-2 border border-red-200 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form id="auth-form" onSubmit={handleFormSubmit} className="space-y-3">
            <div className="form-group mb-2">
              <label className="form-label text-xs font-semibold text-gray-700">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-control text-xs"
                placeholder="e.g. Maria Santos"
              />
            </div>

            <div className="form-group mb-2">
              <label className="form-label text-xs font-semibold text-gray-700">Username *</label>
              <input
                type="text"
                name="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-control text-xs"
                placeholder="Choose a username"
              />
            </div>

            <div className="form-group mb-2">
              <label className="form-label text-xs font-semibold text-gray-700">Email Address *</label>
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control text-xs"
                placeholder="e.g. maria@example.com (for verification)"
              />
            </div>

            <div className="form-group mb-2">
              <label className="form-label text-xs font-semibold text-gray-700">Password *</label>
              <input
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control text-xs"
                placeholder="At least 6 characters"
              />
            </div>

            <div className="form-group mb-4">
              <label className="form-label text-xs font-semibold text-gray-700">Confirm Password *</label>
              <input
                type="password"
                name="confirmation"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="form-control text-xs"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full py-2.5 font-bold shadow text-xs sm:text-sm"
            >
              {isLoading ? 'Creating Account...' : 'Continue to Terms & Privacy'}
            </button>
          </form>

          <div className="text-center mt-5 pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-500">Already have an account? </span>
            <Link to="/login" data-action="login" className="text-xs font-semibold text-[#1565c0] hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* Mandatory Terms & Conditions + Data Privacy Consent Modal */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        onAccept={handleAcceptTermsAndRegister}
      />
    </div>
  );
};
