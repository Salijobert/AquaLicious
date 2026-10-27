import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { auth } from '../auth/firebase.js';
import { sendEmailVerification } from 'firebase/auth';
import { resolver } from '../api/multiServerResolver.js';
import { useNavigate } from 'react-router-dom';
import { Mail, CheckCircle2, AlertCircle, RefreshCw, LogOut } from 'lucide-react';

export const VerifyEmailPromptPage: React.FC = () => {
  const { user, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [cooldown, setCooldown] = useState<number>(0);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Tick 60-second countdown cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setMessage(null);

    const emailToSend = user?.email || (user?.username?.includes('@') ? user.username : '');
    if (!emailToSend) {
      setMessage({ text: 'Unable to identify account email for resending.', type: 'error' });
      setIsResending(false);
      return;
    }

    try {
      // 1. Direct Firebase email dispatch if Firebase session active
      if (auth.currentUser) {
        try {
          await sendEmailVerification(auth.currentUser, {
            url: 'https://aqualicious.vercel.app/verify-email-complete'
          });
        } catch (fbErr: any) {
          console.warn('Firebase sendEmailVerification notice:', fbErr.message);
        }
      }

      // 2. Backend email service dispatch
      await resolver.request('/api/auth/resend-verification', {
        method: 'POST',
        data: { email: emailToSend }
      });
      setMessage({
        text: 'A new verification link has been sent to your inbox. Please check your spam/junk folder as well.',
        type: 'success'
      });
      setCooldown(60);
    } catch (err: any) {
      setMessage({
        text: err.message || 'Failed to resend verification email. Please try again later.',
        type: 'error'
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setIsChecking(true);
    setMessage(null);

    try {
      // 1. Reload the Firebase user record to fetch updated emailVerified status
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
      }

      // 2. Refresh profile from backend
      const updatedProfile = await refreshProfile();

      // Check current auth profile or firebase state
      const isVerified = Boolean(auth.currentUser?.emailVerified || updatedProfile?.email_verified);

      if (isVerified) {
        navigate('/', { replace: true });
      } else {
        setMessage({
          text: 'Your email has not been verified yet. Please click the link received in your inbox, then tap "I\'ve Verified" again.',
          type: 'info'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || 'Verification check failed. Please try again.',
        type: 'error'
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayEmail = user?.email || user?.username || 'your registered email';

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)' }}
    >
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-[#1565c0]/10 flex items-center justify-center text-[#1565c0]">
              <Mail className="w-7 h-7" />
            </div>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#0b3d91] tracking-tight">
            Check Your Inbox
          </h2>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">
            Email Verification Required
          </p>
        </div>

        <p className="text-xs text-gray-600 text-center mb-4 leading-relaxed">
          We've sent a verification link from <strong className="text-slate-800">aqualiciousadmin@gmail.com</strong> to:
          <br />
          <span className="font-bold text-[#1565c0] text-sm break-all">{displayEmail}</span>
        </p>

        <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3.5 mb-5 text-[11px] text-blue-900 leading-normal">
          <p className="font-semibold mb-1">Mobile App & Browser Instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-700">
            <li>Open the email on your phone or computer.</li>
            <li>Tap the verification link to verify your account in your browser.</li>
            <li>Return here and tap <strong className="text-slate-900">"I've Verified"</strong> below.</li>
          </ol>
        </div>

        {message && (
          <div
            className={`p-3 mb-4 rounded-lg text-xs flex items-center gap-2 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : message.type === 'error'
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleCheckVerified}
            disabled={isChecking}
            className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Checking Status...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                I've Verified
              </>
            )}
          </button>

          <button
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            className="btn btn-outline border-slate-300 hover:border-slate-400 text-slate-700 w-full font-semibold text-xs"
          >
            {isResending
              ? 'Sending...'
              : cooldown > 0
              ? `Resend Link in ${cooldown}s`
              : 'Resend Verification Email'}
          </button>
        </div>

        <div className="text-center mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center justify-center gap-1.5 mx-auto font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out / Use Another Account
          </button>
        </div>
      </div>
    </div>
  );
};
