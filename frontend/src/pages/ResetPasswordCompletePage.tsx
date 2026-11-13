import React, { useEffect, useRef, useState } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset, signOut } from 'firebase/auth';
import { auth } from '../auth/firebase.js';
import { resolver } from '../api/multiServerResolver.js';
import { Link, useLocation } from 'react-router-dom';
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';

interface ParsedResetParams {
  oobCode: string;
  legacyToken: string;
}

function extractResetParams(search: string, hash: string): ParsedResetParams {
  const merged = new URLSearchParams(search || '');

  // Support Capacitor HashRouter links (e.g. #/reset-password-complete?mode=resetPassword&oobCode=...)
  if (hash && hash.includes('?')) {
    const hashQuery = hash.slice(hash.indexOf('?') + 1);
    const hashParams = new URLSearchParams(hashQuery);
    hashParams.forEach((value, key) => {
      if (!merged.has(key) || key === 'oobCode' || key === 'token' || key === 'mode') {
        merged.set(key, value);
      }
    });
  }

  return {
    oobCode: (merged.get('oobCode') || '').trim(),
    legacyToken: (merged.get('token') || '').trim()
  };
}

function getPasswordStrength(pw: string): { label: string; score: number; barColor: string; textColor: string } {
  if (!pw) return { label: '', score: 0, barColor: 'bg-gray-200', textColor: 'text-gray-400' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

  if (pw.length < 6 || score <= 1) {
    return { label: 'Weak', score: 1, barColor: 'bg-red-500', textColor: 'text-red-600' };
  }
  if (score === 2 || score === 3) {
    return { label: 'Fair', score: 2, barColor: 'bg-amber-500', textColor: 'text-amber-600' };
  }
  return { label: 'Strong', score: 3, barColor: 'bg-emerald-500', textColor: 'text-emerald-600' };
}

export const ResetPasswordCompletePage: React.FC = () => {
  const location = useLocation();
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const checkedKeyRef = useRef<string>('');
  const confirmLockRef = useRef<boolean>(false);

  const parsed = extractResetParams(
    window.location.search || location.search,
    window.location.hash
  );

  useEffect(() => {
    const checkKey = `${parsed.oobCode}|${parsed.legacyToken}`;
    if (checkedKeyRef.current === checkKey) {
      return;
    }
    checkedKeyRef.current = checkKey;

    let cancelled = false;

    const validateCode = async () => {
      setIsValidating(true);
      setCodeError(null);

      // Legacy custom token= reset links are retired and rejected strictly
      if (parsed.legacyToken) {
        if (!cancelled) {
          setCodeError('This link is no longer valid. Request a new one.');
          setIsValidating(false);
        }
        return;
      }

      if (!parsed.oobCode) {
        if (!cancelled) {
          setCodeError('This password reset link is missing a valid reset code. Please request a new one.');
          setIsValidating(false);
        }
        return;
      }

      try {
        const email = await verifyPasswordResetCode(auth, parsed.oobCode);
        if (!cancelled) {
          setOobCode(parsed.oobCode);
          setAccountEmail(email);
          setIsValidating(false);
        }
      } catch (err: any) {
        if (cancelled) return;
        setIsValidating(false);
        if (err?.code === 'auth/expired-action-code') {
          setCodeError('This password reset link has expired. Please request a new one.');
        } else if (err?.code === 'auth/invalid-action-code') {
          setCodeError('This link is no longer valid. Request a new one.');
        } else if (err?.code === 'auth/user-disabled') {
          setCodeError('This account has been disabled. Please contact the station for assistance.');
        } else if (err?.code === 'auth/network-request-failed') {
          setCodeError('Network error while checking your reset link. Please check your connection and reload.');
        } else {
          setCodeError(err?.message || 'Unable to verify reset code. Please request a new link.');
        }
      }
    };

    validateCode();
    return () => {
      cancelled = true;
    };
  }, [parsed.oobCode, parsed.legacyToken]);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword.length >= 6 && newPassword === confirmPassword;

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmLockRef.current || isSubmitting || isSuccess) return;
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
      setFormError('Missing reset action code. Please request a new reset link.');
      return;
    }

    confirmLockRef.current = true;
    setIsSubmitting(true);

    try {
      // Change password strictly through Firebase's action code flow
      await confirmPasswordReset(auth, oobCode, newPassword);

      // Clear any previous local token / cached Firebase session so re-login starts fresh
      resolver.setToken('');
      try {
        sessionStorage.removeItem('aq_auth_notice');
      } catch {}
      await signOut(auth).catch(() => {});

      setIsSuccess(true);
    } catch (err: any) {
      confirmLockRef.current = false;
      if (err?.code === 'auth/expired-action-code') {
        setFormError('This reset link has expired. Please request a new one.');
      } else if (err?.code === 'auth/invalid-action-code') {
        setFormError('This link is no longer valid or was already used. Request a new one.');
      } else if (err?.code === 'auth/weak-password') {
        setFormError('Please choose a stronger password (at least 6 characters).');
      } else if (err?.code === 'auth/network-request-failed') {
        setFormError('Network error while saving your new password. Please check your connection and try again.');
      } else {
        setFormError(err?.message || 'Failed to reset password. Please request a new link.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12"
      style={{
        background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)',
        paddingTop: 'calc(2rem + var(--safe-top))',
        paddingBottom: 'calc(2rem + var(--safe-bottom))'
      }}
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
              <div
                role="alert"
                className="p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2 border border-red-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label text-xs font-semibold text-gray-700">New Password *</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    name="newPassword"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-control text-xs pr-9"
                    placeholder="Minimum 6 characters (use letters, numbers & symbols)"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPassword && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            strength.score >= step ? strength.barColor : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-[11px] font-semibold ${strength.textColor}`}>
                      Password strength: {strength.label}
                      {newPassword.length < 6 ? ' (at least 6 characters required)' : ''}
                    </p>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold text-gray-700">Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="form-control text-xs pr-9"
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[11px] text-red-600 mt-1">Passwords do not match.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !passwordsMatch}
                className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 text-xs min-h-[42px]"
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
