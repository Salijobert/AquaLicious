import React, { useState } from 'react';
import { getLastUpdateDiagnostics, UpdateDiagnostics } from '../services/updater.js';
import { Copy, Check, Terminal, Shield } from 'lucide-react';
import { Modal } from './Modal.js';

interface UpdateDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateDiagnosticsModal: React.FC<UpdateDiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const diagnostics: UpdateDiagnostics = getLastUpdateDiagnostics();

  const handleCopy = async () => {
    try {
      const formatted = JSON.stringify(diagnostics, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formatted);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = formatted;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      headerVariant="hero"
      ariaLabelledBy="diagnostics-modal-title"
      closeAriaLabel="Close diagnostics"
      icon={
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Terminal className="w-4 h-4 text-white" />
        </div>
      }
      title="Updater Diagnostics"
      subtitle="Non-secret system & OTA verification telemetry"
      bodyClassName="space-y-4 text-xs text-slate-700"
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Diagnostics</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1565c0] hover:bg-[#0b3d91] text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      }
    >
          {/* Version Info Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Native Version Code:</span>
              <span className="font-mono font-bold text-slate-800">{diagnostics.nativeVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Base App Version:</span>
              <span className="font-mono font-bold text-slate-800">{diagnostics.baseAppVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Running Web Bundle:</span>
              <span className="font-mono font-bold text-[#1565c0]">{diagnostics.runningBundleVersion}</span>
            </div>
          </div>

          {/* Crypto Key Info */}
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#0b3d91]">
              <Shield className="w-3.5 h-3.5" />
              <span>Public Key Fingerprint (SPKI SHA-256)</span>
            </div>
            <div className="font-mono text-[11px] text-[#1565c0] break-all bg-white p-2 rounded border border-blue-200">
              {diagnostics.publicKeyFingerprint}...
            </div>
          </div>

          {/* Manifest Fetch Info */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800 flex items-center justify-between">
              <span>Manifest Target</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                diagnostics.httpStatus === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                HTTP {diagnostics.httpStatus || 'N/A'}
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-600 break-all bg-white p-2 rounded border border-slate-200">
              {diagnostics.manifestUrl}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
              <div>Cache-Control: <span className="font-mono text-slate-700">{diagnostics.cacheControlHeader || 'N/A'}</span></div>
              <div>x-vercel-cache: <span className="font-mono text-slate-700">{diagnostics.xVercelCacheHeader || 'N/A'}</span></div>
            </div>
          </div>

          {/* Verification & Download Results */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800">Verification & Bundle Status</div>
            
            {diagnostics.lastManifestFetched ? (
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Fetched Version:</span>
                  <span className="font-mono font-bold text-slate-800">{diagnostics.lastManifestFetched.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Checksum (Prefix):</span>
                  <span className="font-mono text-slate-700">{diagnostics.lastManifestFetched.checksumPrefix}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Signature Format:</span>
                  <span className="font-mono text-slate-700">{diagnostics.lastManifestFetched.signatureFormat}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Signature Check:</span>
                  <span className={`font-bold ${
                    diagnostics.signatureVerificationResult?.status === 'PASS'
                      ? 'text-emerald-600'
                      : diagnostics.signatureVerificationResult?.status === 'FAIL'
                      ? 'text-rose-600'
                      : 'text-amber-600'
                  }`}>
                    {diagnostics.signatureVerificationResult?.status || 'NOT_RUN'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 italic mt-0.5">
                  {diagnostics.signatureVerificationResult?.reason}
                </p>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Download Status:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {diagnostics.zipDownloadStatus?.status || 'NOT_ATTEMPTED'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-[11px] italic">
                No manifest fetched yet during this session.
              </p>
            )}

            {diagnostics.failingStep !== 'none' && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-700 text-[11px]">
                <strong>Failing Step:</strong> {diagnostics.failingStep}
                {diagnostics.lastError && <div>{diagnostics.lastError}</div>}
              </div>
            )}
          </div>
    </Modal>
  );
};
