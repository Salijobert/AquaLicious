import React, { useState, useRef, useEffect } from 'react';
import { useOrders, usePatchOrder } from '../api/client.js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import {
  Truck,
  QrCode,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  X,
  Clock,
  User,
  CreditCard,
  Hash,
  ShieldCheck,
  FileImage
} from 'lucide-react';
import { VirtualCardList, OrderCardSkeleton } from '../components/virtual/index.js';
import { AdminPageHeader } from '../components/AdminPageHeader.js';
import { MockQrDisplay } from '../utils/mockQr.js';
import {
  formatPaymentMethod,
  formatPaymentStatus,
  formatOrderStatus,
  formatFulfillment,
  getPaymentGatingNote,
  getAllowedOrderActions,
  getFriendlyErrorMessage
} from '../utils/orderLabels.js';

export const OrdersPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const { data: orders, error } = useOrders();
  const patchOrderMutation = usePatchOrder();
  const queryClient = useQueryClient();

  // Toast / inline notification state
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Customer Pay Now Modal states
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBase64, setProofBase64] = useState<string>('');
  const [proofPreview, setProofPreview] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Admin View Payment Modal states
  const [viewPaymentOrder, setViewPaymentOrder] = useState<any | null>(null);
  const [viewPaymentProof, setViewPaymentProof] = useState<any | null>(null);
  const [proofBlobUrl, setProofBlobUrl] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [modalActionError, setModalActionError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // Clean up blob URL on unmount or when proofBlobUrl changes
  useEffect(() => {
    return () => {
      if (proofBlobUrl) {
        URL.revokeObjectURL(proofBlobUrl);
      }
    };
  }, [proofBlobUrl]);

  // Focus trap refs
  const payModalRef = useRef<HTMLDivElement>(null);
  const viewModalRef = useRef<HTMLDivElement>(null);

  // Android hardware back button and Escape key listener for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isZoomed) {
          setIsZoomed(false);
          return;
        }
        if (payOrder) setPayOrder(null);
        if (viewPaymentOrder) setViewPaymentOrder(null);
      }
    };

    const handlePopState = () => {
      if (isZoomed) {
        setIsZoomed(false);
        return;
      }
      if (payOrder) setPayOrder(null);
      if (viewPaymentOrder) setViewPaymentOrder(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isZoomed, payOrder, viewPaymentOrder]);

  // Push history state when opening modal so Android back button closes it cleanly
  const openPayModal = (order: any) => {
    setPayOrder(order);
    setProofFile(null);
    setProofBase64('');
    setProofPreview('');
    setReferenceNumber(order.reference_number || '');
    setUploadError(null);
    try {
      window.history.pushState({ modal: 'pay' }, '');
    } catch {}
  };

  const openViewPaymentModal = (order: any) => {
    setViewPaymentOrder(order);
    setIsZoomed(false);
    setShowRejectInput(false);
    setRejectReason('');
    setModalActionError(null);
    try {
      window.history.pushState({ modal: 'view_payment' }, '');
    } catch {}
  };

  const closeModals = () => {
    if (proofBlobUrl) {
      URL.revokeObjectURL(proofBlobUrl);
      setProofBlobUrl(null);
    }
    if (payOrder) setPayOrder(null);
    if (viewPaymentOrder) setViewPaymentOrder(null);
    setIsZoomed(false);
  };

  // Load payment proof metadata & image for Admin View Payment modal
  useEffect(() => {
    if (!viewPaymentOrder) {
      if (proofBlobUrl) {
        URL.revokeObjectURL(proofBlobUrl);
        setProofBlobUrl(null);
      }
      setViewPaymentProof(null);
      setShowRejectInput(false);
      setRejectReason('');
      setModalActionError(null);
      setIsZoomed(false);
      return;
    }

    let isMounted = true;
    setIsLoadingProof(true);
    setModalActionError(null);

    const token = localStorage.getItem('aq_token') || sessionStorage.getItem('aq_token') || localStorage.getItem('aqualicious_token') || '';

    // 1. Fetch metadata JSON
    fetch(`/api/orders?proof=${viewPaymentOrder.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            return { proof_base64: null, reference_number: viewPaymentOrder.reference_number };
          }
          throw new Error('Payment details could not be loaded');
        }
        const data = await res.json();

        // 2. If proof image exists, fetch binary image blob with Authorization header
        if (data?.proof_base64) {
          try {
            const imgRes = await fetch(`/api/orders?proof=${viewPaymentOrder.id}&raw=1`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              const objectUrl = URL.createObjectURL(blob);
              if (isMounted) {
                setProofBlobUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return objectUrl;
                });
              } else {
                URL.revokeObjectURL(objectUrl);
              }
            }
          } catch (e) {
            console.warn('Failed to load blob image, falling back to base64', e);
          }
        }
        return data;
      })
      .then((data) => {
        if (isMounted) {
          setViewPaymentProof(data);
          setIsLoadingProof(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setModalActionError(getFriendlyErrorMessage(err));
          setIsLoadingProof(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [viewPaymentOrder]);

  // Handle proof file selection with strict client-side validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setProofFile(null);
      setProofBase64('');
      setProofPreview('');
      return;
    }

    // 1. File size check (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Payment proof exceeds 5MB limit. Please upload a smaller image.');
      e.target.value = '';
      return;
    }

    // 2. Double extension and suspicious filename check
    const filename = file.name.toLowerCase().trim();
    const parts = filename.split('.');
    if (parts.length > 2) {
      setUploadError('Double extension or suspicious file names are strictly rejected.');
      e.target.value = '';
      return;
    }
    const ext = parts[parts.length - 1];
    if (!['jpg', 'jpeg', 'png'].includes(ext)) {
      setUploadError('Invalid format. Only PNG and JPEG (.png, .jpg, .jpeg) are accepted.');
      e.target.value = '';
      return;
    }

    // 3. Magic byte validation
    const reader = new FileReader();
    reader.onloadend = () => {
      const buffer = new Uint8Array(reader.result as ArrayBuffer);
      const isJpeg =
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;
      const isPng =
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;

      if (!isJpeg && !isPng) {
        setUploadError('Invalid file signature. File must be a real JPEG or PNG photo.');
        setProofFile(null);
        setProofBase64('');
        setProofPreview('');
        return;
      }

      // Read as Data URL for payload and preview
      const dataUrlReader = new FileReader();
      dataUrlReader.onloadend = () => {
        const result = dataUrlReader.result as string;
        setProofFile(file);
        setProofBase64(result);
        setProofPreview(result);
      };
      dataUrlReader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
  };

  // Submit proof handler (Customer)
  const handleClaimPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder || !proofBase64) return;
    setUploadError(null);

    try {
      await patchOrderMutation.mutateAsync({
        id: payOrder.id,
        action: 'claim',
        reference_number: referenceNumber.trim() || undefined,
        proof_base64: proofBase64,
        filename: proofFile?.name
      });
      setPayOrder(null);
      setProofFile(null);
      setProofBase64('');
      setProofPreview('');
      setReferenceNumber('');
      setToastMessage({
        text: 'Payment proof submitted successfully! Verification is in progress.',
        type: 'success'
      });
    } catch (err: any) {
      setUploadError(getFriendlyErrorMessage(err));
    }
  };

  // Status transitions (Admin)
  const updateStatus = async (id: number, status: string, cashReceived = false) => {
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'status',
        status,
        cash_received: cashReceived
      });
      setToastMessage({
        text: `Order status updated to ${formatOrderStatus(status)}.`,
        type: 'success'
      });
    } catch (err: any) {
      // Re-fetch orders so stale buttons disappear
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setToastMessage({
        text: getFriendlyErrorMessage(err),
        type: 'error'
      });
    }
  };

  // Verify payment (Admin)
  const handleVerifyPayment = async (id: number) => {
    setModalActionError(null);
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'verify',
        notes: 'Verified against station merchant wallet'
      });
      setViewPaymentOrder(null);
      setToastMessage({
        text: 'Payment successfully verified! Fulfillment buttons are now unlocked.',
        type: 'success'
      });
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setModalActionError(getFriendlyErrorMessage(err));
    }
  };

  // Reject payment (Admin)
  const handleRejectPayment = async (id: number) => {
    if (!rejectReason.trim()) {
      setModalActionError('Please enter a rejection reason before rejecting.');
      return;
    }
    setModalActionError(null);
    try {
      await patchOrderMutation.mutateAsync({
        id,
        action: 'reject',
        notes: rejectReason.trim()
      });
      setViewPaymentOrder(null);
      setToastMessage({
        text: 'Payment proof was rejected. The customer can now re-upload proof.',
        type: 'info'
      });
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setModalActionError(getFriendlyErrorMessage(err));
    }
  };

  return (
    <div className="page-content space-y-6">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="alert"
          aria-live="polite"
          className={`flex items-center justify-between p-4 rounded-xl border shadow-md text-sm font-semibold transition-all ${
            toastMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
            ) : toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            ) : (
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-600" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-current"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Orders List Container */}
      <div className="orders-list-container">
        <VirtualCardList
          items={orders}
          itemHeight={240}
          className="space-y-4"
          emptyContent={
            <div className="card text-center py-16 text-gray-400">
              <p className="text-sm font-semibold">No active water orders found.</p>
            </div>
          }
          renderSkeletonItem={(index) => <OrderCardSkeleton key={index} />}
          renderItem={(order: any) => {
            const rawPaymentMethod = order.payment_method || order.payment?.method || 'CASH';
            const rawPaymentStatus = order.payment_status || order.payment?.status || 'PENDING';
            const rawOrderStatus = order.status || order.orderStatus || 'PENDING';
            const isCash = rawPaymentMethod.toUpperCase() === 'CASH';
            const isEWallet = !isCash;
            const isEWalletVerified = isEWallet && (rawPaymentStatus === 'VERIFIED' || rawPaymentStatus === 'COMPLETED');
            const customerDisplayName =
              order.customer ||
              order.customer_name ||
              order.user?.name ||
              (order.fulfillment === 'WALK_IN_POS' || order.order_type === 'WALK_IN_POS'
                ? 'Walk-in customer'
                : 'Walk-in customer');

            const gatingNote = getPaymentGatingNote(order);
            const allowedActions = getAllowedOrderActions(order);
            const canPrepare = allowedActions.includes('PREPARE');
            const canReadyForPickup = allowedActions.includes('READY_FOR_PICKUP');
            const canDispatch = allowedActions.includes('OUT_FOR_DELIVERY');
            const canComplete = allowedActions.includes('COMPLETED');
            const canCancel = allowedActions.includes('CANCEL');

            return (
              <div
                key={order.id}
                className="order card bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-5 transition-all"
              >
                {/* Main Order Details Area */}
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-black text-base text-[#1565c0]">
                      #{order.order_number}
                    </span>
                    <span className="badge badge-info flex items-center gap-1.5 font-semibold px-2.5 py-1">
                      <Truck className="w-3.5 h-3.5" /> {formatFulfillment(order.fulfillment)}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      {new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                    </span>
                  </div>

                  <div className="text-xs text-gray-700 space-y-1.5">
                    <div className="truncate max-w-[450px]">
                      <strong className="text-gray-500">Customer:</strong>{' '}
                      <span className="font-bold text-gray-900 text-sm">{customerDisplayName}</span>
                    </div>
                    {order.address && (
                      <div className="truncate max-w-[450px] text-gray-600">
                        <strong className="text-gray-500">Delivery Address:</strong> {order.address}
                      </div>
                    )}
                    <div className="pt-0.5">
                      <span className="font-bold text-gray-600">Items: </span>
                      {order.items?.map((item: any, idx: number) => (
                        <span
                          key={idx}
                          className="mr-2 inline-block bg-gray-100 px-2.5 py-1 rounded-lg text-gray-800 font-semibold text-xs mt-1"
                        >
                          {item.product_name || item.product?.name} × {item.qty}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Payment Information Card */}
                  <div className="mt-2 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-semibold text-gray-700">
                        Mode of Payment:{' '}
                        <span className="text-[#0b3d91] font-bold">
                          {formatPaymentMethod(rawPaymentMethod)}
                        </span>
                      </span>

                      {/* Payment Status Badges */}
                      {rawPaymentStatus === 'COMPLETED' ? (
                        <span className="badge badge-success text-xs font-bold text-white flex items-center gap-1 px-2.5 py-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Payment: Completed
                        </span>
                      ) : isCash ? (
                        <span className="badge badge-warning text-xs font-bold px-2.5 py-1">
                          Payment: {formatPaymentStatus(rawPaymentStatus)}
                        </span>
                      ) : rawPaymentStatus === 'SUBMITTED' ? (
                        <span className="badge badge-info text-xs font-bold text-white flex items-center gap-1 px-2.5 py-1">
                          Payment: Proof Submitted – For Verification
                        </span>
                      ) : rawPaymentStatus === 'VERIFIED' ? (
                        <span className="badge badge-success text-xs font-bold text-white flex items-center gap-1 px-2.5 py-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Payment: Verified
                        </span>
                      ) : rawPaymentStatus === 'REJECTED' ? (
                        <span className="badge badge-error text-xs font-bold text-white flex items-center gap-1 px-2.5 py-1">
                          <XCircle className="w-3.5 h-3.5" /> Payment: Rejected
                        </span>
                      ) : rawPaymentStatus === 'REFUND_REQUIRED' ? (
                        <span className="badge badge-error text-xs font-bold text-white px-2.5 py-1">
                          Payment: Refund Required
                        </span>
                      ) : rawPaymentStatus === 'REFUNDED' ? (
                        <span className="badge badge-neutral text-xs font-bold px-2.5 py-1">
                          Payment: Refunded
                        </span>
                      ) : (
                        <span className="badge badge-warning text-xs font-bold px-2.5 py-1">
                          Payment: Awaiting Payment
                        </span>
                      )}
                    </div>

                    {/* Show rejection reason notes if rejected */}
                    {rawPaymentStatus === 'REJECTED' && (order.notes || order.payment?.notes) && (
                      <div className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 break-words">
                        <strong>Rejection Reason:</strong> {String(order.notes || order.payment?.notes).slice(0, 500)}
                      </div>
                    )}

                    {/* Reference Number */}
                    {(order.reference_number || order.payment?.reference_number) && (
                      <div className="text-gray-700 font-mono text-xs flex items-center gap-1.5 pt-0.5">
                        <strong className="font-sans text-gray-500">Reference No.:</strong>
                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                          {order.reference_number || order.payment?.reference_number}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price & Action Area - Touch-Friendly Buttons (Min 40-44px Height) */}
                <div className="flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5 w-full md:w-80 md:min-w-[300px]">
                  <div className="w-full">
                    <div className="text-xs text-gray-500 font-medium text-right mb-1">Order Amount</div>
                    <div className="flex items-center justify-between md:justify-end gap-3 flex-wrap">
                      <span
                        className={`badge font-bold px-3 py-1.5 text-xs ${
                          rawOrderStatus === 'COMPLETED'
                            ? 'badge-success'
                            : rawOrderStatus === 'CANCELLED'
                            ? 'badge-danger'
                            : rawOrderStatus === 'READY_FOR_PICKUP' || rawOrderStatus === 'OUT_FOR_DELIVERY'
                            ? 'badge-info'
                            : rawOrderStatus === 'PREPARING'
                            ? 'badge-primary'
                            : 'badge-warning'
                        }`}
                      >
                        {formatOrderStatus(rawOrderStatus)}
                      </span>
                      <span className="text-2xl font-black text-[#0b3d91] whitespace-nowrap">
                        ₱{Number(order.total).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 w-full mt-3">
                    {/* Customer E-Wallet Pay Now Button */}
                    {!isAdmin && isEWallet && (rawPaymentStatus === 'PENDING' || rawPaymentStatus === 'REJECTED') && (
                      <button
                        type="button"
                        onClick={() => openPayModal(order)}
                        className="btn btn-primary min-h-[42px] h-[42px] w-full text-sm font-bold gap-2 shadow-sm whitespace-nowrap rounded-xl"
                      >
                        <QrCode className="w-4 h-4 flex-shrink-0" />
                        {rawPaymentStatus === 'REJECTED' ? 'Re-upload Proof' : 'Pay Now'}
                      </button>
                    )}

                    {/* Admin View Payment Button (Always visible for E-Wallet orders) */}
                    {isAdmin && isEWallet && (
                      <button
                        type="button"
                        onClick={() => openViewPaymentModal(order)}
                        className="btn btn-outline btn-primary min-h-[42px] h-[42px] w-full text-sm font-bold gap-2 whitespace-nowrap rounded-xl border-blue-400 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4 flex-shrink-0" />
                        View Payment
                      </button>
                    )}

                    {/* Admin Fulfillment Actions */}
                    {isAdmin && (
                      <div className="flex flex-col gap-2 w-full">
                        {/* Fulfillment Gating Note for Unverified E-Wallet */}
                        {gatingNote && rawOrderStatus !== 'COMPLETED' && rawOrderStatus !== 'CANCELLED' && (
                          <div className="w-full py-2.5 px-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-2 text-center">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                            <span>{gatingNote}</span>
                          </div>
                        )}

                        {canPrepare && (
                          <button
                            type="button"
                            onClick={() => updateStatus(order.id, 'PREPARING')}
                            className="btn btn-outline min-h-[42px] h-[42px] w-full text-sm font-bold whitespace-nowrap rounded-xl border-gray-300 hover:bg-gray-50"
                          >
                            Prepare
                          </button>
                        )}

                        {canReadyForPickup && (
                          <button
                            type="button"
                            onClick={() => updateStatus(order.id, 'READY_FOR_PICKUP')}
                            className="btn btn-info min-h-[42px] h-[42px] w-full text-sm font-bold text-white whitespace-nowrap rounded-xl shadow-sm bg-[#0288d1] hover:bg-[#0277bd] border-none"
                          >
                            Ready for Pickup
                          </button>
                        )}

                        {canDispatch && (
                          <button
                            type="button"
                            onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
                            className="btn btn-info min-h-[42px] h-[42px] w-full text-sm font-bold text-white whitespace-nowrap rounded-xl shadow-sm bg-[#0288d1] hover:bg-[#0277bd] border-none"
                          >
                            Out for Delivery
                          </button>
                        )}

                        {canComplete && (
                          <button
                            type="button"
                            onClick={() => updateStatus(order.id, 'COMPLETED', isCash)}
                            className="btn btn-primary min-h-[42px] h-[42px] w-full text-sm font-bold text-white whitespace-nowrap rounded-xl shadow-sm"
                          >
                            Complete Order
                          </button>
                        )}

                        {canCancel && rawOrderStatus !== 'COMPLETED' && rawOrderStatus !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => updateStatus(order.id, 'CANCELLED')}
                            className="btn btn-outline btn-error min-h-[42px] h-[42px] w-full text-sm font-bold whitespace-nowrap rounded-xl hover:bg-red-50"
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Customer E-Wallet Pay Now Modal */}
      {payOrder && (
        <dialog open className="modal modal-open z-50">
          <div
            ref={payModalRef}
            className="modal-box max-w-lg bg-white text-slate-800 p-6 rounded-2xl shadow-2xl border border-slate-200"
          >
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <h3 className="font-black text-lg text-[#0b3d91] flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                Pay with E-Wallet
              </h3>
              <button
                type="button"
                onClick={closeModals}
                className="btn btn-sm btn-circle btn-ghost text-gray-500"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleClaimPayment} className="space-y-4 mt-4">
              {/* Mock QR SVG Component */}
              <MockQrDisplay
                orderNumber={payOrder.order_number}
                amount={payOrder.total}
              />

              {uploadError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Upload proof of payment control */}
              <div className="form-group space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Upload Proof of Payment (PNG or JPEG only) *</span>
                  <span className="text-[10px] text-gray-400 font-normal">Max 5MB</span>
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="file-input file-input-bordered file-input-sm w-full bg-white text-xs h-10 rounded-xl"
                  required
                />
                <p className="text-[10px] text-gray-400">Must be an official payment receipt or screenshot.</p>
              </div>

              {/* File Preview */}
              {proofPreview && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-3">
                  <img
                    src={proofPreview}
                    alt="Proof preview"
                    className="w-16 h-16 object-cover rounded-lg border border-gray-300"
                  />
                  <div className="truncate text-xs">
                    <p className="font-semibold text-gray-800 truncate">{proofFile?.name}</p>
                    <p className="text-gray-400 text-[10px]">
                      {(proofFile?.size ? proofFile.size / 1024 : 0).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              )}

              {/* Reference Number Field */}
              <div className="form-group space-y-1.5">
                <label className="text-xs font-bold text-gray-700">
                  Reference Number <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10023491823"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="input input-bordered input-sm w-full bg-white text-xs h-10 rounded-xl"
                />
              </div>

              <div className="modal-action flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModals}
                  className="btn btn-sm btn-ghost px-4 h-10 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!proofBase64 || patchOrderMutation.isPending}
                  className="btn btn-sm btn-primary px-6 h-10 rounded-xl font-bold"
                >
                  {patchOrderMutation.isPending ? 'Submitting...' : 'Submit Proof'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* Admin View Payment Modal */}
      {viewPaymentOrder && (
        <dialog open className="modal modal-open z-50">
          <div
            ref={viewModalRef}
            className="modal-box max-w-lg bg-white text-slate-800 p-6 rounded-2xl shadow-2xl border border-slate-200"
          >
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <h3 className="font-black text-lg text-[#0b3d91] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                E-Wallet Payment Verification
              </h3>
              <button
                type="button"
                onClick={closeModals}
                className="btn btn-sm btn-circle btn-ghost text-gray-500"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              {/* Order and Payment Snapshot Details */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-gray-400 font-semibold block">Order Number:</span>
                  <p className="font-mono font-bold text-[#1565c0] text-sm">
                    #{viewPaymentOrder.order_number}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Customer Name:</span>
                  <p className="font-bold text-gray-900 text-sm truncate">
                    {viewPaymentOrder.customer ||
                      viewPaymentOrder.customer_name ||
                      viewPaymentOrder.user?.name ||
                      'Walk-in customer'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Order Amount:</span>
                  <p className="font-black text-base text-[#0b3d91]">
                    ₱{Number(viewPaymentOrder.total).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Mode of Payment:</span>
                  <p className="font-bold text-gray-800">
                    {formatPaymentMethod(viewPaymentOrder.payment_method || viewPaymentOrder.payment?.method)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Payment Status:</span>
                  <span
                    className={`badge text-[11px] font-bold mt-0.5 ${
                      viewPaymentOrder.payment_status === 'VERIFIED' || viewPaymentOrder.payment_status === 'COMPLETED'
                        ? 'badge-success text-white'
                        : viewPaymentOrder.payment_status === 'SUBMITTED'
                        ? 'badge-info text-white'
                        : viewPaymentOrder.payment_status === 'REJECTED'
                        ? 'badge-error text-white'
                        : 'badge-warning'
                    }`}
                  >
                    {formatPaymentStatus(viewPaymentOrder.payment_status || viewPaymentOrder.payment?.status)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Submitted At (Asia/Manila):</span>
                  <p className="font-medium text-gray-800">
                    {new Date(
                      viewPaymentProof?.submitted_at || viewPaymentOrder.created_at
                    ).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                  </p>
                </div>
                <div className="col-span-2 border-t border-gray-200 pt-2">
                  <span className="text-gray-400 font-semibold block">Reference Number:</span>
                  <p className="font-mono font-bold text-gray-900 text-sm">
                    {viewPaymentProof?.reference_number ||
                      viewPaymentOrder.reference_number ||
                      viewPaymentOrder.payment?.reference_number ||
                      'None provided'}
                  </p>
                </div>

                {/* Verification audit attribution if verified */}
                {viewPaymentProof?.verified_by && (
                  <div className="col-span-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>
                      Verified by <strong className="font-bold">{viewPaymentProof.verified_by}</strong> on{' '}
                      {new Date(viewPaymentProof.verified_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                    </span>
                  </div>
                )}
              </div>

              {modalActionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>{modalActionError}</span>
                </div>
              )}

              {/* Uploaded Proof Section with Click-to-Zoom */}
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50 flex flex-col items-center">
                <div className="flex justify-between items-center w-full mb-2">
                  <span className="font-bold text-gray-700 flex items-center gap-1.5">
                    <FileImage className="w-4 h-4 text-gray-500" />
                    Uploaded Proof Image
                  </span>
                  {viewPaymentProof?.proof_base64 && (
                    <button
                      type="button"
                      onClick={() => setIsZoomed(!isZoomed)}
                      className="btn btn-xs btn-outline gap-1 font-semibold"
                    >
                      {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                      {isZoomed ? 'Reset Zoom' : 'Click to Zoom'}
                    </button>
                  )}
                </div>

                {isLoadingProof ? (
                  <div className="py-12 text-center text-gray-400 font-medium">
                    Loading proof details...
                  </div>
                ) : viewPaymentProof?.proof_base64 ? (
                  <div className="w-full text-center relative overflow-hidden rounded-lg">
                    <img
                      src={proofBlobUrl || viewPaymentProof.proof_base64}
                      alt="Customer payment proof"
                      onClick={() => setIsZoomed(!isZoomed)}
                      className={`cursor-pointer transition-all duration-200 rounded-lg shadow-sm border border-gray-300 object-contain mx-auto ${
                        isZoomed ? 'max-h-[500px] w-full scale-105' : 'max-h-72 w-auto'
                      }`}
                      title="Click to toggle full size"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Click image to toggle zoom.</p>
                  </div>
                ) : (
                  <div className="py-10 text-center text-gray-400 font-medium space-y-1">
                    <p className="text-gray-500 font-semibold">No proof uploaded yet.</p>
                    {(viewPaymentOrder.reference_number || viewPaymentProof?.reference_number) && (
                      <p className="text-amber-700 text-[11px] bg-amber-50 p-2 rounded-lg border border-amber-200">
                        Notice: A reference number was entered without an image proof.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Rejection Reason Form (Shown when Reject clicked) */}
              {showRejectInput && (
                <div className="space-y-2.5 p-3.5 bg-red-50 rounded-xl border border-red-200">
                  <label className="font-bold text-red-900 block text-xs">
                    Reason for Rejection *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Reference number not found in merchant statement"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input input-bordered input-sm w-full bg-white text-xs h-10 rounded-xl"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(false)}
                      className="btn btn-xs btn-ghost h-8 px-3 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={patchOrderMutation.isPending || !rejectReason.trim()}
                      onClick={() => handleRejectPayment(viewPaymentOrder.id)}
                      className="btn btn-xs btn-error text-white font-bold h-8 px-4 rounded-lg"
                    >
                      {patchOrderMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}

              {/* Verify & Reject Actions for SUBMITTED payments */}
              {viewPaymentOrder.payment_status === 'SUBMITTED' && !showRejectInput && (
                <div className="flex gap-2.5 pt-3 border-t border-gray-100 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowRejectInput(true)}
                    disabled={patchOrderMutation.isPending}
                    className="btn btn-sm btn-outline btn-error font-bold h-10 px-4 rounded-xl"
                  >
                    Reject Claim
                  </button>
                  <button
                    type="button"
                    disabled={patchOrderMutation.isPending}
                    onClick={() => handleVerifyPayment(viewPaymentOrder.id)}
                    className="btn btn-sm btn-primary font-bold px-6 h-10 rounded-xl"
                  >
                    {patchOrderMutation.isPending ? 'Verifying...' : 'Verify Payment'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
};
