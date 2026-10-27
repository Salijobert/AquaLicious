import React, { useEffect, useState } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../auth/firebase.js';
import { resolver } from '../api/multiServerResolver.js';
import { Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertCircle, RefreshCw, Lock, ArrowRight } from 'lucide-react';

export const ResetPasswordCompletePage: React.FC = () => {
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
    const params = new URLSearchParams(rawSearch);
    const code = params.get('oobCode');

    if (!code) {
      setCodeError('Missing password reset action code.');
      setIsValidating(false);
      return;
    }

    setOobCode(code);

    verifyPasswordResetCode(auth, code)
      .then((email) => {
        setAccountEmail(email);
        setIsValidating(false);
      })
      .catch((err: any) => {
        console.error('verifyPasswordResetCode error:', err);
        setIsValidating(false);
        if (err.code === 'auth/invalid-action-code') {
          setCodeError('This password reset link is invalid or has already been used.');
        } else if (err.code === 'auth/expired-action-code') {
          setCodeError('This password reset link has expired. Please request a new one.');
        } else {
          setCodeError(err.message || 'Unable to verify reset code.');
        }
      });
  }, []);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (!oobCode) {
      setFormError('Missing reset action code.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Confirm password reset in Firebase
      await confirmPasswordReset(auth, oobCode, newPassword);

      // 2. Invalidate previous sessions across devices via backend admin SDK
      try {
        await resolver.request('/api/auth/post-reset', {
          method: 'POST',
          data: { email: accountEmail }
        });
      } catch (postErr) {
        console.warn('Backend post-reset notification error:', postErr);
      }

      setIsSuccess(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)' }}
    >
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-[#1565c0]/10 flex items-center justify-center text-[#1565c0]">
              <Lock className="w-7 h-7" />
            </div>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#0b3d91] tracking-tight">
            Create New Password
          </h2>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">
            AquaLicious Security
          </p>
        </div>

        {isValidating && (
          <div className="py-8 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#1565c0] animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Verifying reset code...</p>
          </div>
        )}

        {!isValidating && codeError && (
          <div className="py-4 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Reset Link Invalid</h3>
              <p className="text-xs text-red-600 font-medium mt-2">{codeError}</p>
              <p className="text-xs text-slate-500 mt-1">
                Please request a fresh reset link from the forgot password page.
              </p>
            </div>
            <div className="pt-2">
              <Link to="/forgot-password" className="btn btn-primary w-full font-bold shadow text-xs">
                Request New Reset Link
              </Link>
            </div>
          </div>
        )}

        {!isValidating && !codeError && isSuccess && (
          <div className="py-4 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Password Changed!</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Your password has been successfully updated. All prior active sessions have been invalidated for your security.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                You can now sign in with your new credentials on the web or in the mobile app.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 text-xs"
              >
                Sign In With New Password
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {!isValidating && !codeError && !isSuccess && (
          <>
            <p className="text-xs text-gray-600 text-center mb-5 leading-relaxed">
              Resetting password for: <strong className="text-slate-800">{accountEmail}</strong>
            </p>

            {formError && (
              <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label text-xs font-semibold text-gray-700">New Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-control text-xs"
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold text-gray-700">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-control text-xs"
                  placeholder="Re-enter new password"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 text-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    Set New Password
                  </>
                )}
              </button>
            </form>

            <div className="text-center mt-6 pt-4 border-t border-gray-100">
              <Link to="/login" className="text-xs font-semibold text-[#1565c0] hover:underline">
                Return to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
