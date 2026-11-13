import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { applyActionCode, checkActionCode } from 'firebase/auth';
import { auth } from '../auth/firebase.js';
import { useAuth } from '../auth/AuthContext.js';
import { resolver } from '../api/multiServerResolver.js';
import { MailCheck, ShieldAlert, Clock, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';

type VerificationStatus =
  | 'checking'
  | 'ready'
  | 'confirming'
  | 'verified'
  | 'already-verified'
  | 'expired'
  | 'invalid';

interface ParsedParams {
  mode: string;
  oobCode: string;
  legacyToken: string;
}

function extractParamsFromLocation(search: string, hash: string): ParsedParams {
  const merged = new URLSearchParams(search || '');

  // Support Capacitor HashRouter links (e.g., #/verify-email-complete?mode=verifyEmail&oobCode=...)
  if (hash && hash.includes('?')) {
    const hashQuery = hash.slice(hash.indexOf('?') + 1);
    const hashParams = new URLSearchParams(hashQuery);
    hashParams.forEach((value, key) => {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    });
  }

  return {
    mode: (merged.get('mode') || '').trim(),
    oobCode: (merged.get('oobCode') || '').trim(),
    legacyToken: (merged.get('token') || '').trim()
  };
}

function maskEmailAddress(email: string): string {
  const clean = (email || '').trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return clean || 'your account email';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export const VerifyEmailCompletePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const [status, setStatus] = useState<VerificationStatus>('checking');
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [rawEmail, setRawEmail] = useState<string>('');
  const [errorHeadline, setErrorHeadline] = useState<string>('');
  const [errorDetail, setErrorDetail] = useState<string>('');

  const checkedKeyRef = useRef<string>('');
  const confirmLockRef = useRef<boolean>(false);

  const parsed = extractParamsFromLocation(
    window.location.search || location.search,
    window.location.hash
  );

  useEffect(() => {
    const checkKey = `${parsed.mode}|${parsed.oobCode}|${parsed.legacyToken}`;
    if (checkedKeyRef.current === checkKey) {
      return;
    }
    checkedKeyRef.current = checkKey;

    let cancelled = false;

    const inspectLink = async () => {
      setStatus('checking');
      setErrorHeadline('');
      setErrorDetail('');

      // Reject legacy HMAC token links cleanly — only Firebase Action Codes verify emails
      if (parsed.legacyToken && !parsed.oobCode) {
        if (!cancelled) {
          setErrorHeadline('Verification Failed');
          setErrorDetail(
            'This older verification link format is no longer supported. Please sign in and tap Resend Verification Email to receive a new link.'
          );
          setStatus('invalid');
        }
        return;
      }

      if (!parsed.oobCode) {
        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              if (!cancelled) {
                setMaskedEmail(maskEmailAddress(auth.currentUser.email || ''));
                setStatus('already-verified');
              }
              return;
            }
          } catch {
            // Fall through to invalid state if reload fails
          }
        }
        if (!cancelled) {
          setErrorHeadline('Verification Failed');
          setErrorDetail(
            'No valid verification code was found in this link. Please open the newest verification email from AquaLicious or request a new one.'
          );
          setStatus('invalid');
        }
        return;
      }

      if (parsed.mode && parsed.mode !== 'verifyEmail') {
        if (!cancelled) {
          setErrorHeadline('Verification Failed');
          setErrorDetail('This link is not an email verification link.');
          setStatus('invalid');
        }
        return;
      }

      try {
        // Non-consuming validation only: email link scanners/previews and React StrictMode cannot burn this code
        const info = await checkActionCode(auth, parsed.oobCode);
        const emailFromCode = info?.data?.email || '';
        const masked = maskEmailAddress(emailFromCode);

        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
            if (
              auth.currentUser.emailVerified &&
              (!emailFromCode || auth.currentUser.email?.toLowerCase() === emailFromCode.toLowerCase())
            ) {
              if (!cancelled) {
                setMaskedEmail(masked);
                setRawEmail(emailFromCode);
                setStatus('already-verified');
              }
              return;
            }
          } catch {
            // Continue showing explicit confirm button
          }
        }

        if (!cancelled) {
          setRawEmail(emailFromCode);
          setMaskedEmail(masked);
          setStatus('ready');
        }
      } catch (err: any) {
        const code = err?.code || '';
        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              if (!cancelled) {
                setMaskedEmail(maskEmailAddress(auth.currentUser.email || ''));
                setStatus('already-verified');
              }
              return;
            }
          } catch {
            // Fall through to friendly error state
          }
        }

        if (!cancelled) {
          if (code === 'auth/expired-action-code') {
            setErrorHeadline('Verification Link Expired');
            setErrorDetail(
              'This verification link has expired. Request a new link from your account and make sure to open only the newest email.'
            );
            setStatus('expired');
          } else {
            setErrorHeadline('Verification Failed');
            setErrorDetail(
              'This verification link is invalid or has already been used. If you already verified your email, try signing in; otherwise request a new link.'
            );
            setStatus('invalid');
          }
        }
      }
    };

    void inspectLink();

    return () => {
      cancelled = true;
    };
  }, [parsed.mode, parsed.oobCode, parsed.legacyToken]);

  const handleConfirmVerify = async () => {
    if (!parsed.oobCode || confirmLockRef.current || status === 'confirming') {
      return;
    }
    confirmLockRef.current = true;
    setStatus('confirming');
    setErrorHeadline('');
    setErrorDetail('');

    try {
      await applyActionCode(auth, parsed.oobCode);

      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          const freshToken = await auth.currentUser.getIdToken(true);
          if (freshToken) {
            resolver.setToken(freshToken);
          }
          await refreshProfile();
        } catch {
          // Non-fatal: user is verified in Firebase; next API call / sign-in syncs backend
        }
      }

      setStatus('verified');
    } catch (err: any) {
      const code = err?.code || '';
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          if (auth.currentUser.emailVerified) {
            setStatus('already-verified');
            return;
          }
        } catch {
          // Proceed to error message
        }
      }

      if (code === 'auth/expired-action-code') {
        setErrorHeadline('Verification Link Expired');
        setErrorDetail(
          'This verification link has expired before completion. Please sign in and request a fresh verification link.'
        );
        setStatus('expired');
      } else {
        setErrorHeadline('Verification Failed');
        setErrorDetail(
          'This verification link is invalid or was already used. If you already confirmed your email, sign in to continue.'
        );
        setStatus('invalid');
      }
    } finally {
      confirmLockRef.current = false;
    }
  };

  const targetAfterVerify = user || auth.currentUser ? '/' : '/login';
  const targetLabel = user || auth.currentUser ? 'Continue to AquaLicious' : 'Go to Sign In';

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-10"
      style={{
        background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)',
        paddingTop: 'calc(2.5rem + var(--safe-top, 0px))',
        paddingBottom: 'calc(2.5rem + var(--safe-bottom, 0px))'
      }}
    >
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-slate-200 p-6 sm:p-8 text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#1565c0] mb-3">
          EMAIL VERIFICATION
        </p>

        {status === 'checking' && (
          <div className="py-6 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-[#1565c0]">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
            <h1 className="font-serif text-xl font-bold text-slate-900">
              Checking Your Verification Link
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Validating your verification code without consuming it...
            </p>
          </div>
        )}

        {(status === 'ready' || status === 'confirming') && (
          <div className="space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-[#1565c0]">
              <MailCheck className="w-7 h-7" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#0b3d91]">
              Confirm Your Email
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Tap the button below to verify{' '}
              <strong className="text-slate-900 break-all" title={rawEmail || undefined}>
                {maskedEmail || 'your email address'}
              </strong>
              .
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleConfirmVerify}
                disabled={status === 'confirming'}
                className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 min-h-[44px]"
              >
                {status === 'confirming' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying Email...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Verify my email
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Your verification code stays safe until you press the button above.
            </p>
          </div>
        )}

        {(status === 'verified' || status === 'already-verified') && (
          <div className="space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-slate-900">
              {status === 'already-verified' ? 'Email Already Verified' : 'Email Verified!'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {maskedEmail
                ? `${maskedEmail} is now verified and ready to place orders on AquaLicious.`
                : 'Your email address is verified and ready to place orders on AquaLicious.'}
            </p>
            <button
              type="button"
              onClick={() => navigate(targetAfterVerify, { replace: true })}
              className="btn btn-primary w-full font-bold shadow flex items-center justify-center gap-2 min-h-[44px]"
            >
              <span>{targetLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {(status === 'expired' || status === 'invalid') && (
          <div className="space-y-4">
            <div
              className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center ${
                status === 'expired' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
              }`}
            >
              {status === 'expired' ? <Clock className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
            </div>
            <h1 className="font-serif text-xl font-bold text-slate-900">
              {errorHeadline || 'Verification Failed'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {errorDetail ||
                'Unable to verify this link. Please sign in and request a fresh verification email.'}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to={user || auth.currentUser ? '/verify-email' : '/login'}
                className="btn btn-primary w-full font-bold min-h-[44px] flex items-center justify-center"
              >
                {user || auth.currentUser ? 'Request New Link' : 'Sign In to Request New Link'}
              </Link>
              <Link to="/" className="btn btn-ghost btn-sm text-slate-600">
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
