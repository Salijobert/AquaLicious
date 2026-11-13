import React from 'react';
import { Droplet, Award, Clock, MapPin, Phone, Mail, CheckCircle2, ShieldCheck } from 'lucide-react';
import { COPY } from '../constants/copy.js';
import { Modal } from './Modal.js';

interface AboutStationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutStationModal: React.FC<AboutStationModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      headerVariant="hero"
      closeAriaLabel="Close"
      subtitle={COPY.ABOUT.SUBTITLE}
      title={COPY.ABOUT.TITLE}
      icon={
        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
          <Droplet className="w-6 h-6 text-white fill-white" />
        </div>
      }
      headerDescription={COPY.ABOUT.DESCRIPTION}
      bodyClassName="space-y-6"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1565c0] text-white hover:bg-[#0b3d91] shadow-sm transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      }
    >
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
    </Modal>
  );
};
