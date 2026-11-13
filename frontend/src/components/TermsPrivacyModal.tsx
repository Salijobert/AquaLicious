import React, { useState, useEffect, useRef } from 'react';
import { TERMS_CONTENT, TERMS_VERSION } from '../constants/terms.js';
import { ShieldCheck } from 'lucide-react';
import { Modal } from './Modal.js';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (termsVersion: string) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  isSubmitting = false,
  submitLabel
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
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && (document.activeElement === first || !modalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !modalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            first.focus();
          }
        }
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      backdropRef={modalRef}
      size="2xl"
      zIndexClass="z-[999]"
      headerVariant="subtle"
      ariaLabelledBy="terms-modal-title"
      disableClose={isSubmitting}
      closeOnBackdrop={false}
      closeAriaLabel="Close Terms and Privacy Modal"
      icon={
        <div className="w-9 h-9 rounded-full bg-[#1565c0] flex items-center justify-center text-white shadow-xs">
          <ShieldCheck className="w-5 h-5" />
        </div>
      }
      title="Terms & Data Privacy Notice"
      subtitle={`Philippine Data Privacy Act of 2012 (RA 10173) · Version ${TERMS_VERSION}`}
      bodyClassName="space-y-5 text-xs text-gray-700 leading-relaxed select-text"
      footer={
        <div className="flex items-center justify-end gap-3">
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
            {isSubmitting ? 'Saving...' : (submitLabel || 'Accept & Register')}
          </button>
        </div>
      }
    >
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
    </Modal>
  );
};
