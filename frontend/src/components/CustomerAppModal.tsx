import React from 'react';
import { X, Smartphone, Download, CheckCircle, Zap, MapPin, CreditCard, ShieldCheck } from 'lucide-react';
import { COPY } from '../constants/copy.js';

interface CustomerAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerAppModal: React.FC<CustomerAppModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-[#e3f2fd] overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0b3d91] via-[#1565c0] to-[#1e88e5] text-white p-6 sm:p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest font-bold text-white/80">Android Application</span>
              <h2 className="text-2xl font-serif font-bold tracking-tight">{COPY.APP.TITLE}</h2>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-md">
            {COPY.APP.DESCRIPTION}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#f5f7fa] border border-[#eceff1] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#e3f2fd] text-[#1565c0] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0b3d91]">{COPY.APP.FEATURES[0].title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{COPY.APP.FEATURES[0].desc}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f5f7fa] border border-[#eceff1] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#e3f2fd] text-[#1565c0] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0b3d91]">{COPY.APP.FEATURES[1].title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{COPY.APP.FEATURES[1].desc}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f5f7fa] border border-[#eceff1] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#e3f2fd] text-[#1565c0] flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0b3d91]">{COPY.APP.FEATURES[2].title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{COPY.APP.FEATURES[2].desc}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f5f7fa] border border-[#eceff1] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#e3f2fd] text-[#1565c0] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#2e7d32]" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0b3d91]">{COPY.APP.FEATURES[3].title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{COPY.APP.FEATURES[3].desc}</div>
              </div>
            </div>
          </div>

          {/* Download Action Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-[#e3f2fd] to-[#f5f7fa] border border-[#bbdefb] text-center space-y-3">
            <div className="text-xs font-bold text-[#0b3d91]">Download for Android</div>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Download the release APK directly to your phone.
            </p>
            <a
              href="/deliverables/AquaLicious-release.apk"
              download="AquaLicious-release.apk"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#1565c0] hover:bg-[#0b3d91] text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all"
            >
              <Download className="w-4 h-4" /> {COPY.APP.BUTTON_DOWNLOAD}
            </a>
          </div>

          {/* Quick Install Guide */}
          <div className="border-t border-[#eceff1] pt-4">
            <div className="text-xs font-bold text-[#455a64] mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#2e7d32]" /> Installation Steps
            </div>
            <ol className="text-[11px] text-slate-500 space-y-1 list-decimal list-inside">
              <li>Download the APK file onto your Android device.</li>
              <li>Allow installation from your browser if prompted.</li>
              <li>Open <strong>AquaLicious</strong> from your apps and log in.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#f5f7fa] px-6 sm:px-8 py-3.5 border-t border-[#eceff1] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
