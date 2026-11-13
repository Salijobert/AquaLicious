import React from 'react';
import { Smartphone, Download, CheckCircle, Zap, MapPin, CreditCard, ShieldCheck } from 'lucide-react';
import { COPY } from '../constants/copy.js';
import { Modal } from './Modal.js';

interface CustomerAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerAppModal: React.FC<CustomerAppModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      headerVariant="hero"
      closeAriaLabel="Close"
      subtitle="Android Application"
      title={COPY.APP.TITLE}
      icon={
        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-white" />
        </div>
      }
      headerDescription={COPY.APP.DESCRIPTION}
      bodyClassName="space-y-6"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      }
    >
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
    </Modal>
  );
};
