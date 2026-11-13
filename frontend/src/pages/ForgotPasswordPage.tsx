import React, { useState } from 'react';
import { resolver } from '../api/multiServerResolver.js';
import { Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertCircle, ArrowLeft, Send, Droplet } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await resolver.request('/api/auth/forgot-password', {
        method: 'POST',
        data: { email: email.trim().toLowerCase() }
      });
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Unable to process password reset request.');
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
          Reset Password
        </div>
      </header>

      <main id="main-content" className="w-full max-w-md px-4 mt-3 sm:mt-0 flex-1 flex flex-col justify-center">
        <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-6 sm:p-8">
          <div className="text-center mb-5">
            <div className="hidden sm:flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-[#1565c0]/10 flex items-center justify-center text-[#1565c0]">
                <KeyRound className="w-7 h-7" />
              </div>
            </div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#0b3d91] tracking-tight">
              Reset Password
            </h2>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">
              AquaLicious Security
            </p>
          </div>

          {isSubmitted ? (
            <div className="py-2 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Check Your Email</h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  If an account exists with <strong className="text-slate-800">{email}</strong>, a password reset link has been dispatched from <strong className="text-slate-800">aqualiciousadmin@gmail.com</strong>.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Please check your inbox and spam folder. The link will expire after 1 hour.
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <Link
                  to="/login"
                  className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 text-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-600 text-center mb-5 leading-relaxed">
                Enter your account email address below and we'll send you instructions to safely reset your password.
              </p>

              {error && (
                <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold text-gray-700">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control text-xs"
                    placeholder="e.g. customer@example.com"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full py-2.5 font-bold shadow flex items-center justify-center gap-2 text-xs"
                >
                  {isLoading ? (
                    'Sending Instructions...'
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Reset Link
                    </>
                  )}
                </button>
              </form>

              <div className="text-center mt-6 pt-4 border-t border-gray-100">
                <Link
                  to="/login"
                  className="text-xs font-semibold text-[#1565c0] hover:underline flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
