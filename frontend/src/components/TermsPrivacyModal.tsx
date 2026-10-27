import React, { useState, useEffect, useRef } from 'react';
import { TERMS_CONTENT, TERMS_VERSION } from '../constants/terms.js';
import { ShieldCheck, X } from 'lucide-react';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (termsVersion: string) => void;
  isSubmitting?: boolean;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  isSubmitting = false
}) => {
  const [agreed, setAgreed] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const acceptBtnRef = useRef<HTMLButtonElement>(null);

  // Reset agreement on open
  useEffect(() => {
    if (isOpen) {
      setAgreed(false);
    }
  }, [isOpen]);

  // Handle Escape key and Android hardware back button
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Handle Android hardware back button via DOM and Capacitor runtime
    const handleBackButton = (e: Event) => {
      if (!isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('backbutton', handleBackButton);
    const capApp = (window as any).Capacitor?.Plugins?.App;
    let capListenerHandle: any = null;
    if (capApp?.addListener) {
      capApp.addListener('backButton', () => {
        if (!isSubmitting) {
          onClose();
        }
      }).then((handle: any) => {
        capListenerHandle = handle;
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('backbutton', handleBackButton);
      if (capListenerHandle && typeof capListenerHandle.remove === 'function') {
        capListenerHandle.remove();
      }
    };
  }, [isOpen, isSubmitting, onClose]);

  // Trap focus inside modal
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      tabIndex={-1}
      ref={modalRef}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1565c0] flex items-center justify-center text-white shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="font-serif font-bold text-base sm:text-lg text-[#0b3d91]">
                Terms & Data Privacy Notice
              </h2>
              <p className="text-[11px] text-gray-500 font-medium">
                Philippine Data Privacy Act of 2012 (RA 10173) · Version {TERMS_VERSION}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close Terms and Privacy Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-gray-700 leading-relaxed flex-1 select-text">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-normal font-medium">
            <strong>Important Notice:</strong> AquaLicious values your trust and complies with Republic Act No. 10173. Please review this notice to understand how your information and payment proofs are collected, stored, and protected.
          </div>

          {TERMS_CONTENT.sections.map((section, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm font-sans border-b border-gray-100 pb-1">
                {section.title}
              </h3>
              {section.paragraphs.map((p, pIdx) => (
                <p key={pIdx} className="text-gray-600 font-normal">
                  {p}
                </p>
              ))}
            </div>
          ))}

          {/* Consent Checkbox */}
          <div className="pt-4 border-t border-gray-200">
            <label className="flex items-start gap-3 p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={isSubmitting}
                className="checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0"
              />
              <span className="text-xs text-gray-800 font-medium leading-snug select-none">
                I have read and agree to the Terms and Conditions and consent to the processing of my personal data in accordance with the Data Privacy Act of 2012 (RA 10173).
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-gray-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-outline btn-sm font-semibold px-4"
          >
            Cancel
          </button>
          <button
            ref={acceptBtnRef}
            type="button"
            disabled={!agreed || isSubmitting}
            onClick={() => onAccept(TERMS_VERSION)}
            className="btn btn-primary btn-sm font-bold text-white px-5 shadow-sm"
          >
            {isSubmitting ? 'Registering...' : 'Accept & Register'}
          </button>
        </div>
      </div>
    </div>
  );
};
