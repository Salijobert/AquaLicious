import React, { useState } from 'react';
import { useOrders, usePatchOrder, useConfig } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { ClipboardList, QrCode, CheckCircle, XCircle, Clock, Truck, ShieldAlert } from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const isStaff = role === 'Staff';
  const { data: orders, isLoading, error } = useOrders();
  const { data: config } = useConfig();
  const patchOrderMutation = usePatchOrder();

  const [claimOrder, setClaimOrder] = useState<any | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofBase64, setProofBase64] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaimPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimOrder) return;
    setClaimError(null);

    try {
      await patchOrderMutation.mutateAsync({
        id: claimOrder.id,
        action: 'claim',
        reference_number: referenceNumber,
        proof_base64: proofBase64
      });
      setClaimOrder(null);
      setReferenceNumber('');
      setProofBase64('');
    } catch (err: any) {
      setClaimError(err.message || 'Payment claim failed');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateStatus = async (id: number, status: string, cashReceived = false) => {
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'status',
        status,
        cash_received: cashReceived
      });
    } catch (err: any) {
      alert(err.message || 'Status update failed');
    }
  };

  const verifyPayment = async (id: number) => {
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'verify',
        notes: 'Verified against station merchant wallet'
      });
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    }
  };

  const rejectPayment = async (id: number) => {
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'reject',
        notes: 'Reference number mismatch'
      });
    } catch (err: any) {
      alert(err.message || 'Rejection failed');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Orders</h1>
          <p className="text-xs text-slate-500 font-semibold">Track water deliveries, pickup reservations & payments</p>
        </div>
      </div>

      {orders?.length === 0 ? (
        <div className="card bg-white p-12 text-center rounded-2xl shadow-sm border border-slate-200">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Orders Yet</h3>
          <p className="text-xs text-slate-500 mt-1">Place an order from the product catalog to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders?.map((o: any) => (
            <div
              key={o.id}
              className="order card bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-primary">{o.order_number}</span>
                    <span className="badge badge-sm badge-secondary badge-outline font-bold">
                      {o.fulfillment}
                    </span>
                    <span className="badge badge-sm badge-ghost text-xs">
                      {o.payment_method}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Customer: <strong className="text-slate-700">{o.customer}</strong> · {new Date(o.created_at).toLocaleString('en-PH')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`badge font-bold px-3 py-2 text-xs ${
                      o.status === 'COMPLETED'
                        ? 'badge-success text-white'
                        : o.status === 'CANCELLED'
                        ? 'badge-error text-white'
                        : o.status === 'OUT_FOR_DELIVERY'
                        ? 'badge-info text-white'
                        : 'badge-warning text-slate-900'
                    }`}
                  >
                    {o.status}
                  </span>
                  <span
                    className={`badge badge-sm font-semibold ${
                      o.payment_status === 'VERIFIED'
                        ? 'badge-success text-white'
                        : o.payment_status === 'SUBMITTED'
                        ? 'badge-info text-white'
                        : o.payment_status === 'REFUND_REQUIRED'
                        ? 'badge-error text-white'
                        : 'badge-ghost text-slate-600'
                    }`}
                  >
                    Pay: {o.payment_status}
                  </span>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-1 text-xs">
                {o.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-slate-600">
                    <span>
                      {item.qty} × {item.product_name} ({item.sku})
                    </span>
                    <span className="font-semibold text-slate-900">₱{Number(item.subtotal).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-black text-sm text-primary border-t pt-2 mt-2">
                  <span>Total Amount</span>
                  <span>₱{Number(o.total).toFixed(2)}</span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
                <div className="text-slate-500 text-[11px]">
                  {o.address && <span>Delivery: {o.address}</span>}
                  {o.reference_number && <span className="ml-2 font-mono">Ref: {o.reference_number}</span>}
                </div>

                <div className="flex items-center gap-2">
                  {/* Customer Payment Claim */}
                  {(o.payment_method === 'GCASH_QR' || o.payment_method === 'MAYA_QR') &&
                    o.payment_status === 'PENDING' &&
                    o.status !== 'CANCELLED' && (
                      <button
                        onClick={() => setClaimOrder(o)}
                        className="btn btn-secondary btn-xs font-bold gap-1 text-primary shadow"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Submit Payment Proof
                      </button>
                    )}

                  {/* Admin Payment Verification */}
                  {isAdmin && o.payment_status === 'SUBMITTED' && (
                    <>
                      <button
                        onClick={() => verifyPayment(o.id)}
                        className="btn btn-success btn-xs text-white font-bold gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Verify Payment
                      </button>
                      <button
                        onClick={() => rejectPayment(o.id)}
                        className="btn btn-error btn-xs text-white font-bold gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}

                  {/* Staff / Admin Status Advancement */}
                  {(isAdmin || isStaff) && o.status === 'PENDING' && (
                    <button
                      onClick={() => updateStatus(o.id, 'CONFIRMED')}
                      className="btn btn-primary btn-xs font-bold"
                    >
                      Confirm Order
                    </button>
                  )}

                  {(isAdmin || isStaff) && o.status === 'CONFIRMED' && o.fulfillment === 'DELIVERY' && (
                    <button
                      onClick={() => updateStatus(o.id, 'OUT_FOR_DELIVERY')}
                      className="btn btn-info btn-xs text-white font-bold gap-1"
                    >
                      <Truck className="w-3.5 h-3.5" /> Dispatch Delivery
                    </button>
                  )}

                  {(isAdmin || isStaff) &&
                    (o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY') && (
                      <button
                        onClick={() => updateStatus(o.id, 'COMPLETED', o.payment_method === 'CASH')}
                        className="btn btn-success btn-xs text-white font-bold"
                      >
                        Mark Completed
                      </button>
                    )}

                  {/* Cancel button for customer if pending */}
                  {o.status === 'PENDING' && (
                    <button
                      onClick={() => updateStatus(o.id, 'CANCELLED')}
                      className="btn btn-ghost btn-xs text-error"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Claim Dialog */}
      {claimOrder && (
        <dialog open className="modal modal-open z-50">
          <div className="modal-box bg-white text-slate-800 max-w-md p-6 rounded-2xl shadow-2xl">
            <h3 className="font-bold text-lg text-primary mb-2">Claim QR Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Send exact payment of <strong className="text-primary font-bold">₱{Number(claimOrder.total).toFixed(2)}</strong> to station merchant QR, then enter reference.
            </p>

            {claimError && (
              <div className="alert alert-error text-xs p-2 mb-3">
                <span>{claimError}</span>
              </div>
            )}

            <form onSubmit={handleClaimPayment} className="space-y-3 text-xs">
              <div>
                <label className="label font-bold pb-1">Reference Number / Transaction ID</label>
                <input
                  type="text"
                  required
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800 font-mono"
                  placeholder="e.g. 1002348912"
                />
              </div>

              <div>
                <label className="label font-bold pb-1">Screenshot / Receipt Image</label>
                <input
                  type="file"
                  required
                  accept="image/png, image/jpeg"
                  onChange={handleFileChange}
                  className="file-input file-input-bordered file-input-sm w-full bg-slate-50"
                />
              </div>

              {proofBase64 && (
                <div className="mt-2 text-center">
                  <img
                    src={proofBase64}
                    alt="Proof preview"
                    className="max-h-40 mx-auto rounded-lg border shadow-sm"
                  />
                </div>
              )}

              <div className="modal-action flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setClaimOrder(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={patchOrderMutation.isPending || !proofBase64}
                  className="btn btn-primary btn-sm font-bold"
                >
                  {patchOrderMutation.isPending ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
};
