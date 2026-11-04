import React, { useState, useRef } from 'react';
import { useOrders, usePatchOrder, useConfig } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { CheckCircle, XCircle, Clock, Truck, QrCode } from 'lucide-react';
import { VirtualCardList, OrderCardSkeleton } from '../components/virtual/index.js';
import { AdminPageHeader } from '../components/AdminPageHeader.js';

export const OrdersPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const { data: orders, error } = useOrders();
  const { data: config } = useConfig();
  const patchOrderMutation = usePatchOrder();

  const [claimOrder, setClaimOrder] = useState<any | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofBase64, setProofBase64] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const ordersContainerRef = useRef<HTMLDivElement>(null);

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
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <AdminPageHeader
        title={isAdmin ? "Orders Management" : "My Orders"}
        subtitle={
          isAdmin
            ? "Review incoming orders, verify payments, and manage fulfillment status."
            : "Track water deliveries, pickup reservations, and online payments."
        }
      />

      <div
        ref={ordersContainerRef}
        className="overflow-y-auto max-h-[calc(100vh-220px)] min-h-[400px] pr-1.5 rounded-2xl"
      >
        <VirtualCardList
          items={orders}
          containerRef={ordersContainerRef}
          itemHeight={210}
          className="space-y-4"
          emptyContent={
            <div className="card text-center py-16 text-gray-400">
              <p className="text-sm font-semibold">No active water orders found.</p>
            </div>
          }
          renderSkeletonItem={(index) => <OrderCardSkeleton key={index} />}
          renderItem={(order: any) => (
            <div
              key={order.id}
              className="order card bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-black text-base text-[#1565c0]">
                    #{order.order_number}
                  </span>
                  <span
                    className={`badge font-bold ${
                      order.status === 'COMPLETED'
                        ? 'badge-success'
                        : order.status === 'CANCELLED'
                        ? 'badge-danger'
                        : order.status === 'READY_FOR_PICKUP'
                        ? 'badge-info'
                        : order.status === 'OUT_FOR_DELIVERY'
                        ? 'badge-info'
                        : order.status === 'PREPARING'
                        ? 'badge-primary'
                        : 'badge-warning'
                    }`}
                  >
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <span className="badge badge-info flex items-center gap-1 font-semibold">
                    <Truck className="w-3 h-3" /> {order.fulfillment}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString('en-PH')}
                  </span>
                </div>

                <div className="text-xs text-gray-700 space-y-1">
                  <div>
                    <strong>Customer:</strong> {order.user?.name || order.user?.username || 'Guest'}
                  </div>
                  {order.address && (
                    <div>
                      <strong>Delivery Address:</strong> {order.address}
                    </div>
                  )}
                  <div className="pt-1">
                    <span className="font-semibold text-gray-900">Items: </span>
                    {order.items?.map((item: any, idx: number) => (
                      <span key={idx} className="mr-2 inline-block bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                        {item.product?.name || item.product_name} × {item.qty}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Payment Information */}
                <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700">Method: {order.payment?.method}</span>
                    <span
                      className={`badge text-[10px] font-bold ${
                        order.payment?.status === 'VERIFIED'
                          ? 'badge-success'
                          : order.payment?.status === 'REJECTED'
                          ? 'badge-danger'
                          : 'badge-warning'
                      }`}
                    >
                      Payment: {order.payment?.status || 'PENDING'}
                    </span>
                  </div>
                  {order.payment?.reference_number && (
                    <div className="text-gray-600">
                      <strong>Ref #:</strong> {order.payment.reference_number}
                    </div>
                  )}
                </div>
              </div>

              {/* Price & Action Area */}
              <div className="flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5 min-w-[200px]">
                <div className="text-right w-full">
                  <div className="text-xs text-gray-500">Order Amount</div>
                  <div className="text-2xl font-black text-[#0b3d91]">
                    ₱{Number(order.total).toFixed(2)}
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full mt-3">
                  {/* Customer Upload QR Proof Button */}
                  {order.payment?.method !== 'CASH' && order.payment?.status === 'PENDING' && (
                    <button
                      onClick={() => setClaimOrder(order)}
                      className="btn btn-primary btn-sm w-full font-bold gap-1"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Submit Proof
                    </button>
                  )}

                  {/* Admin Order Status Transitions */}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-1.5 w-full">
                      {order.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => updateStatus(order.id, 'PREPARING')}
                            className="btn btn-outline btn-xs flex-1"
                          >
                            Prepare
                          </button>
                          {order.fulfillment === 'PICKUP' ? (
                            <button
                              onClick={() => updateStatus(order.id, 'READY_FOR_PICKUP')}
                              className="btn btn-info btn-xs flex-1 text-white"
                            >
                              Ready for Pickup
                            </button>
                          ) : (
                            <button
                              onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
                              className="btn btn-info btn-xs flex-1 text-white"
                            >
                              Dispatch
                            </button>
                          )}
                        </>
                      )}
                      {order.status === 'PREPARING' && (
                        <>
                          {order.fulfillment === 'DELIVERY' ? (
                            <button
                              onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
                              className="btn btn-info btn-xs flex-1 text-white"
                            >
                              Dispatch
                            </button>
                          ) : (
                            <button
                              onClick={() => updateStatus(order.id, 'READY_FOR_PICKUP')}
                              className="btn btn-info btn-xs flex-1 text-white"
                            >
                              Ready for Pickup
                            </button>
                          )}
                        </>
                      )}
                      {(order.status === 'OUT_FOR_DELIVERY' || order.status === 'READY_FOR_PICKUP') && (
                        <button
                          onClick={() => updateStatus(order.id, 'COMPLETED', true)}
                          className="btn btn-primary btn-xs flex-1"
                        >
                          Complete Order
                        </button>
                      )}
                      {order.payment?.status === 'CLAIMED' && (
                        <div className="flex gap-1 w-full mt-1">
                          <button
                            onClick={() => verifyPayment(order.id)}
                            className="btn btn-sm btn-primary flex-1 text-[11px]"
                          >
                            Verify Pay
                          </button>
                          <button
                            onClick={() => rejectPayment(order.id)}
                            className="btn btn-sm btn-danger flex-1 text-[11px]"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        />
      </div>

      {/* QR Proof Submission Modal */}
      {claimOrder && (
        <div className="modal-overlay active">
          <div className="modal aq-modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span className="modal-title">Submit Payment Proof</span>
              <button className="modal-close" onClick={() => setClaimOrder(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleClaimPayment} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Reference Number *</label>
                <input
                  required
                  className="form-control"
                  placeholder="e.g. 10023491823"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Screenshot Proof (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="form-control"
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setClaimOrder(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={patchOrderMutation.isPending}
                  className="btn btn-primary"
                >
                  {patchOrderMutation.isPending ? 'Submitting...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
