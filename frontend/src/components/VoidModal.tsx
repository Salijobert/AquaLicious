import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useVoidSale } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { reauthenticateAdmin } from '../auth/firebase.js';

interface VoidModalProps {
  sale: any;
  isOpen: boolean;
  onClose: () => void;
}

export const VoidModal: React.FC<VoidModalProps> = ({ sale, isOpen, onClose }) => {
  const { role } = useAuth();
  const voidSaleMutation = useVoidSale();
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !sale) return null;

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      let adminToken = '';
      if (role !== 'Administrator') {
        if (!adminUsername || !adminPassword) {
          setError('Administrator authorization required for void approval');
          return;
        }
        adminToken = await reauthenticateAdmin(adminUsername, adminPassword);
      }

      await voidSaleMutation.mutateAsync({
        id: sale.id,
        admin_token: adminToken || undefined,
        admin_username: adminUsername || undefined,
        admin_password: adminPassword || undefined,
        reason: reason || 'Cashier void request'
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Void processing failed');
    }
  };

  return (
    <dialog open className="modal modal-open z-50">
      <div className="modal-box bg-white text-slate-800 max-w-md p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <div className="flex items-center gap-2 text-error">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-xl font-bold">Void Transaction #{sale.order_number}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 mb-4">
          Voiding reverses transaction revenue and returns sellable inventory to stock once. This action is permanently logged in the audit trail.
        </p>

        {error && (
          <div className="alert alert-error text-xs p-2 mb-3">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleVoid} className="space-y-3">
          {role !== 'Administrator' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <div className="text-xs font-bold text-amber-800">Administrator Approval Required</div>
              <div>
                <label className="label text-[11px] font-semibold text-slate-600 pb-0">Admin Username</label>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="input input-bordered input-sm w-full bg-white text-slate-800"
                />
              </div>
              <div>
                <label className="label text-[11px] font-semibold text-slate-600 pb-0">Admin Password</label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="input input-bordered input-sm w-full bg-white text-slate-800"
                />
              </div>
            </div>
          )}

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Reason for Void</label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="textarea textarea-bordered text-xs w-full bg-slate-50 text-slate-800"
              placeholder="e.g. Accidental double punch, customer cancelled before water dispensed"
            />
          </div>

          <div className="modal-action flex justify-between mt-6">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={voidSaleMutation.isPending}
              className="btn btn-error btn-sm font-bold text-white px-6"
            >
              {voidSaleMutation.isPending ? 'Processing...' : 'Confirm Void'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
