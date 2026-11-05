import React, { useEffect, useState } from 'react';
import { applyActionCode } from 'firebase/auth';
import { auth } from '../auth/firebase.js';
import { resolver } from '../api/multiServerResolver.js';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';

export const VerifyEmailCompletePage: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function handleVerification() {
      // Support standard search params and Capacitor HashRouter params
      const rawSearch = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
      const params = new URLSearchParams(rawSearch);
      const oobCode = params.get('oobCode');
      const email = params.get('email');

      // Helper to check if already verified in Firebase or backend
      const checkAlreadyVerified = async (): Promise<boolean> => {
        try {
          if (auth.currentUser) {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              return true;
            }
          }
          if (email) {
            const res = await resolver.request<{ verified: boolean }>(`/api/auth/verification-status?email=${encodeURIComponent(email)}`);
            if (res && res.verified) {
              return true;
            }
          }
        } catch {
          // ignore check errors
        }
        return false;
      };

      // 1. If Firebase action code is present, verify via Firebase Web SDK
      if (oobCode && !oobCode.startsWith('code-')) {
        try {
          await applyActionCode(auth, oobCode);
          if (auth.currentUser) {
            await auth.currentUser.reload();
            const token = await auth.currentUser.getIdToken(true);
            resolver.setToken(token);
            await resolver.request('/api/auth').catch(() => {});
          }
          if (isMounted) setStatus('success');
          return;
        } catch (err: any) {
          console.warn('Firebase applyActionCode error:', err.code, err.message);
          // Check if failed because it's already verified / used
          const alreadyVerified = await checkAlreadyVerified();
          if (alreadyVerified && isMounted) {
            setStatus('success');
            return;
          }
          if (isMounted) {
            setStatus('error');
            if (err.code === 'auth/invalid-action-code') {
              setErrorMessage('This verification link is invalid or has already been used.');
            } else if (err.code === 'auth/expired-action-code') {
              setErrorMessage('This verification link has expired. Please request a new one.');
            } else {
              setErrorMessage(err.message || 'Verification failed. Please try requesting a new link.');
            }
          }
          return;
        }
      }

      // 2. If no oobCode or fallback link, check if the account is already verified
      const alreadyVerified = await checkAlreadyVerified();
      if (alreadyVerified && isMounted) {
        setStatus('success');
        return;
      }

      if (isMounted) {
        setStatus('error');
        setErrorMessage('No valid verification action code was found in the link.');
      }
    }

    handleVerification();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)' }}
    >
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#1565c0] flex items-center justify-center text-white shadow-md">
            <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
              <path d="M12 2C8 7 4 10.5 4 14a8 8 0 0016 0c0-3.5-4-7-8-12z" />
            </svg>
          </div>
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#0b3d91] tracking-tight mb-1">
          AquaLicious
        </h2>
        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-6">
          Account Verification
        </p>

        {status === 'verifying' && (
          <div className="py-8 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#1565c0] animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Verifying your email address...</p>
            <p className="text-xs text-slate-500">Please wait while we confirm your link.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Email Verified Successfully!</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Your email address has been verified. If you are using the <strong>AquaLicious mobile app</strong>, you can switch back to the app now and tap <strong>"I've Verified"</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                You can also sign in to your account directly on the web.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2"
              >
                Sign In to AquaLicious
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Verification Link Invalid</h3>
              <p className="text-xs text-red-600 font-medium mt-2">
                {errorMessage}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                If your link has expired, sign in or open the AquaLicious app to request a new verification email.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="btn btn-outline border-slate-300 w-full font-bold"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
