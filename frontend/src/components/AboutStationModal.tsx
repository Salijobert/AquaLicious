import React from 'react';
import { X, Droplet, Award, Clock, MapPin, Phone, Mail, CheckCircle2, ShieldCheck } from 'lucide-react';
import { COPY } from '../constants/copy.js';

interface AboutStationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutStationModal: React.FC<AboutStationModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#e3f2fd] overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#0b3d91] via-[#1565c0] to-[#1e88e5] text-white p-6 sm:p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Droplet className="w-6 h-6 text-white fill-white" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest font-bold text-white/80">{COPY.ABOUT.SUBTITLE}</span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">{COPY.ABOUT.TITLE}</h2>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-xl">
            {COPY.ABOUT.DESCRIPTION}
          </p>
        </div>

        {/* Modal Content */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quality Standards Grid */}
          <div>
            <h3 className="text-sm font-bold text-[#0b3d91] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-[#1565c0]" /> {COPY.ABOUT.QUALITY_HEADER}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {COPY.ABOUT.QUALITY_STANDARDS.map((q, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-[#f5f7fa] border border-[#e3f2fd]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0b3d91] mb-1.5">
                    {idx === 0 ? (
                      <ShieldCheck className="w-4 h-4 text-[#2e7d32]" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#1565c0]" />
                    )}
                    <span>{q.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {q.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Station Details */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#e3f2fd]/50 to-[#bbdefb]/20 border border-[#bbdefb]">
            <h4 className="text-xs font-bold text-[#0b3d91] uppercase tracking-wider mb-3">{COPY.ABOUT.HOURS_TITLE}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-[#1565c0] shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">Schedule:</span>
                  <div>{COPY.ABOUT.HOURS}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#1565c0] shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">{COPY.ABOUT.ADDRESS_LABEL}:</span>
                  <div>{COPY.ABOUT.ADDRESS}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#1565c0] shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">{COPY.ABOUT.PHONE_LABEL}:</span>
                  <div>{COPY.ABOUT.PHONE}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#1565c0] shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">{COPY.ABOUT.EMAIL_LABEL}:</span>
                  <div>{COPY.ABOUT.EMAIL}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#f5f7fa] px-6 sm:px-8 py-4 border-t border-[#eceff1] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1565c0] text-white hover:bg-[#0b3d91] shadow-sm transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
