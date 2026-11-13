import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '../components/Modal.js';
import { useOrdersInfinite, usePatchOrder, usePendingOrdersSummary } from '../api/client.js';
import { resolver } from '../api/multiServerResolver.js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import { COPY } from '../constants/copy.js';
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
import { formatPeso } from '../utils/currency.js';
import {
  formatPaymentMethod,
  formatPaymentStatus,
  formatOrderStatus,
  formatFulfillment,
  formatCashPaymentLabel,
  formatManilaTimeOnly,
  formatManilaTimestamp,
  getPaymentGatingNote,
  getAllowedOrderActions,
  getFriendlyErrorMessage,
  isOrderPending
} from '../utils/orderLabels.js';

type OrderFilterType = 'all' | 'pending' | 'completed' | 'cancelled';

const CANCEL_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Wrong items',
  'Other'
] as const;

export const OrdersPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFilterParam = (searchParams.get('filter') || 'all').toLowerCase();
  const activeFilter: OrderFilterType =
    rawFilterParam === 'pending' || rawFilterParam === 'completed' || rawFilterParam === 'cancelled'
      ? rawFilterParam
      : 'all';
  const highlightedOrderId = Number(searchParams.get('orderId')) || null;

  const apiStatusFilter = activeFilter === 'all' ? 'ALL' : activeFilter.toUpperCase();
  const {
    data: paginatedData,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useOrdersInfinite({ status: apiStatusFilter, limit: 40 });
  const { data: pendingSummary } = usePendingOrdersSummary(1, isAdmin);
  const patchOrderMutation = usePatchOrder();
  const queryClient = useQueryClient();

  const orders = paginatedData ? paginatedData.pages.flatMap((page) => page.items) : undefined;
  const serverCounts = paginatedData?.pages?.[0]?.counts;

  const setFilter = (next: OrderFilterType) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next !== 'all') {
      nextParams.set('filter', next);
    } else {
      nextParams.delete('filter');
      nextParams.delete('orderId');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const pendingOrdersCount = isAdmin
    ? (pendingSummary?.count ?? serverCounts?.pending ?? (Array.isArray(orders) ? orders.filter(isOrderPending).length : 0))
    : (serverCounts?.pending ?? (Array.isArray(orders) ? orders.filter(isOrderPending).length : 0));
  const displayedOrders = orders;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!highlightedOrderId || !Array.isArray(displayedOrders) || displayedOrders.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const el = document.getElementById(`order-card-${highlightedOrderId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightedOrderId, displayedOrders?.length]);

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

  // Order Cancel Confirmation Modal states
  const [cancelOrderTarget, setCancelOrderTarget] = useState<any | null>(null);
  const [cancelReasonChoice, setCancelReasonChoice] = useState<string>(CANCEL_REASONS[0]);
  const [cancelOtherText, setCancelOtherText] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

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
  const cancelModalRef = useRef<HTMLDivElement>(null);

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
        if (cancelOrderTarget) setCancelOrderTarget(null);
      }
    };

    const handlePopState = () => {
      if (isZoomed) {
        setIsZoomed(false);
        return;
      }
      if (payOrder) setPayOrder(null);
      if (viewPaymentOrder) setViewPaymentOrder(null);
      if (cancelOrderTarget) setCancelOrderTarget(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isZoomed, payOrder, viewPaymentOrder, cancelOrderTarget]);

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

  const openCancelModal = (order: any) => {
    setCancelOrderTarget(order);
    setCancelReasonChoice(CANCEL_REASONS[0]);
    setCancelOtherText('');
    setCancelError(null);
    try {
      window.history.pushState({ modal: 'cancel_order' }, '');
    } catch {}
  };

  const closeModals = () => {
    if (proofBlobUrl) {
      URL.revokeObjectURL(proofBlobUrl);
      setProofBlobUrl(null);
    }
    if (payOrder) setPayOrder(null);
    if (viewPaymentOrder) setViewPaymentOrder(null);
    if (cancelOrderTarget) setCancelOrderTarget(null);
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

    (async () => {
      try {
        // 1. Fetch metadata JSON via shared API client (uses apiBaseUrl & ngrok skip warning)
        const data = await resolver.request<any>(`/api/orders?proof=${viewPaymentOrder.id}`);

        // 2. If proof image exists, fetch binary image blob with Authorization header
        if (data?.has_proof || data?.proof_base64) {
          try {
            const blob = await resolver.fetchBlob(`/api/orders?proof=${viewPaymentOrder.id}&raw=1`);
            const objectUrl = URL.createObjectURL(blob);
            if (isMounted) {
              setProofBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return objectUrl;
              });
            } else {
              URL.revokeObjectURL(objectUrl);
            }
          } catch (blobErr) {
            console.warn('[Orders] Could not fetch raw blob, falling back to base64 preview:', blobErr);
          }
        }

        if (isMounted) {
          setViewPaymentProof(data);
          setIsLoadingProof(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[Orders] Failed to load payment proof:', err);
        // Handle 404 (order with no proof record) gracefully
        if (err?.status === 404) {
          setViewPaymentProof({
            has_proof: false,
            proof_base64: null,
            reference_number: viewPaymentOrder.reference_number || null
          });
        } else {
          setModalActionError(getFriendlyErrorMessage(err));
        }
        setIsLoadingProof(false);
      }
    })();

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

  // Confirm Order Cancellation (Customer or Admin)
  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelOrderTarget) return;
    setCancelError(null);

    const finalReason =
      cancelReasonChoice === 'Other'
        ? cancelOtherText.trim().slice(0, 200) || 'Other'
        : cancelReasonChoice;

    try {
      await patchOrderMutation.mutateAsync({
        id: cancelOrderTarget.id,
        action: 'status',
        status: 'CANCELLED',
        reason: finalReason,
        notes: finalReason
      });
      setCancelOrderTarget(null);
      setCancelOtherText('');
      setToastMessage({
        text: `Order #${cancelOrderTarget.order_number} has been cancelled and reserved stock was released.`,
        type: 'info'
      });
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCancelError(getFriendlyErrorMessage(err));
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
        {error ? getFriendlyErrorMessage(error) : ''}
      </div>

      <AdminPageHeader
        title={isAdmin ? "Orders Management" : "My Orders"}
        subtitle={
          isAdmin
            ? "Review incoming orders, verify payments, and manage fulfillment status."
            : "Track water deliveries, pickup reservations, and online payments."
        }
      />

      {/* Order Filter Pills */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter orders">
        {(
          [
            { key: 'all', label: 'All Orders', count: serverCounts?.all },
            { key: 'pending', label: 'Pending', count: pendingOrdersCount },
            { key: 'completed', label: 'Completed', count: serverCounts?.completed },
            { key: 'cancelled', label: 'Cancelled', count: serverCounts?.cancelled }
          ] as Array<{ key: OrderFilterType; label: string; count?: number }>
        ).map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={isActive}
              className={`px-3.5 py-2 min-h-[40px] rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#0b3d91] text-white border-[#0b3d91] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' ? ` (${tab.count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Orders List Container */}
      <div className="orders-list-container space-y-4">
        {isLoading && !displayedOrders ? (
          <div className="space-y-4">
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        ) : (
        <VirtualCardList
          items={displayedOrders}
          itemHeight={240}
          className="space-y-4"
          emptyContent={
            <div className="card text-center py-16 text-gray-500">
              <p className="text-sm font-semibold">
                {activeFilter === 'pending'
                  ? 'No pending orders found.'
                  : activeFilter === 'completed'
                  ? 'No completed orders found.'
                  : activeFilter === 'cancelled'
                  ? 'No cancelled orders found.'
                  : 'No active water orders found.'}
              </p>
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
            const allowedActions = getAllowedOrderActions(order, isAdmin);
            const canPrepare = allowedActions.includes('PREPARE');
            const canReadyForPickup = allowedActions.includes('READY_FOR_PICKUP');
            const canDispatch = allowedActions.includes('OUT_FOR_DELIVERY');
            const canComplete = allowedActions.includes('COMPLETED');
            const canCancel = allowedActions.includes('CANCEL');
            const isHighlighted = highlightedOrderId === order.id;
            const showPostPaymentContact =
              !isAdmin &&
              rawOrderStatus === 'PENDING' &&
              (rawPaymentStatus === 'SUBMITTED' || rawPaymentStatus === 'VERIFIED' || rawPaymentStatus === 'COMPLETED');
            const expiryTimeFormatted = order.payment_expires_at ? formatManilaTimeOnly(order.payment_expires_at) : '';

            return (
              <div
                id={`order-card-${order.id}`}
                key={order.id}
                className={`order card p-5 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between gap-5 transition-all ${
                  isHighlighted
                    ? 'bg-blue-50/40 border-[#1565c0] ring-2 ring-[#1565c0]'
                    : 'bg-white border border-gray-200'
                }`}
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
                          {formatCashPaymentLabel(order.fulfillment)}
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

                    {/* Auto-cancel deadline notice for Customer unpaid E-Wallet orders */}
                    {!isAdmin && isEWallet && rawOrderStatus === 'PENDING' && rawPaymentStatus === 'PENDING' && expiryTimeFormatted && (
                      <div className="text-xs text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        <span>Pay before {expiryTimeFormatted} or this order is cancelled automatically</span>
                      </div>
                    )}

                    {/* Cancellation Details (Visible to Admin and Customer on Cancelled Orders) */}
                    {rawOrderStatus === 'CANCELLED' && (
                      <div className="text-xs text-red-800 bg-red-50 px-2.5 py-2 rounded-lg border border-red-200 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap font-bold">
                          <span>
                            {order.cancelled_by_role === 'CUSTOMER'
                              ? 'Cancelled by customer'
                              : order.cancelled_by_role === 'SYSTEM' || order.cancel_reason === 'Auto-cancelled: unpaid'
                              ? 'Auto-cancelled: unpaid'
                              : 'Cancelled by administrator'}
                          </span>
                          {order.cancelled_at && (
                            <span className="text-[11px] font-medium text-red-700">
                              {formatManilaTimestamp(order.cancelled_at)}
                            </span>
                          )}
                        </div>
                        {order.cancel_reason && (
                          <div className="text-red-700 break-words">
                            <strong>Reason:</strong> {String(order.cancel_reason).slice(0, 300)}
                          </div>
                        )}
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
                        {formatPeso(order.total)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 w-full mt-3">
                    {/* Customer E-Wallet Pay Now Button */}
                    {!isAdmin && isEWallet && rawOrderStatus !== 'CANCELLED' && (rawPaymentStatus === 'PENDING' || rawPaymentStatus === 'REJECTED') && (
                      <button
                        type="button"
                        onClick={() => openPayModal(order)}
                        className="btn btn-primary min-h-[42px] h-[42px] w-full text-sm font-bold gap-2 shadow-sm whitespace-nowrap rounded-xl"
                      >
                        <QrCode className="w-4 h-4 flex-shrink-0" />
                        {rawPaymentStatus === 'REJECTED' ? 'Re-upload Proof' : 'Pay Now'}
                      </button>
                    )}

                    {/* Customer Cancel Order Button (only while PENDING and unpaid/rejected) */}
                    {!isAdmin && canCancel && rawOrderStatus === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => openCancelModal(order)}
                        className="btn btn-outline btn-error min-h-[42px] h-[42px] w-full text-sm font-bold whitespace-nowrap rounded-xl hover:bg-red-50"
                      >
                        Cancel Order
                      </button>
                    )}

                    {/* Customer Post-Payment Contact Notice (SUBMITTED / VERIFIED) */}
                    {showPostPaymentContact && (
                      <div className="w-full p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-[11px] text-slate-700 space-y-0.5">
                        <div className="font-bold text-[#0b3d91]">Contact the station to cancel this order.</div>
                        <div className="text-slate-600">
                          {COPY.ABOUT.EMAIL} · {COPY.ABOUT.PHONE}
                        </div>
                      </div>
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
                            onClick={() => openCancelModal(order)}
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
        )}

        {/* Lazy-load 40-row pagination footer & intersection sentinel */}
        {hasNextPage && (
          <div ref={loadMoreRef} className="flex flex-col items-center justify-center py-4 gap-2">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="btn btn-outline btn-sm min-h-[42px] px-6 rounded-xl font-bold text-xs border-slate-300"
            >
              {isFetchingNextPage ? 'Loading more orders...' : 'Load More Orders'}
            </button>
          </div>
        )}
      </div>

      {/* Customer E-Wallet Pay Now Modal */}
      <Modal
        isOpen={Boolean(payOrder)}
        onClose={closeModals}
        cardRef={payModalRef}
        size="lg"
        closeAriaLabel="Close"
        icon={<QrCode className="w-5 h-5 text-blue-600" />}
        title="Pay with E-Wallet"
      >
        {payOrder && (
          <form onSubmit={handleClaimPayment} className="space-y-4">
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

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
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
        )}
      </Modal>

      {/* Admin View Payment Modal */}
      <Modal
        isOpen={Boolean(viewPaymentOrder)}
        onClose={closeModals}
        cardRef={viewModalRef}
        size="lg"
        closeAriaLabel="Close"
        icon={<CreditCard className="w-5 h-5 text-blue-600" />}
        title="E-Wallet Payment Verification"
      >
        {viewPaymentOrder && (
          <div className="space-y-4 text-xs">
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
                    {formatPeso(viewPaymentOrder.total)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Mode of Payment:</span>
                  <p className="font-bold text-gray-800">
                    {formatPaymentMethod(viewPaymentOrder.payment_method || viewPaymentOrder.payment?.method)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Payment Status:</span>
                  <span
                    className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-md leading-tight max-w-full break-words whitespace-normal ${
                      viewPaymentOrder.payment_status === 'VERIFIED' || viewPaymentOrder.payment_status === 'COMPLETED'
                        ? 'bg-emerald-600 text-white'
                        : viewPaymentOrder.payment_status === 'SUBMITTED'
                        ? 'bg-sky-600 text-white'
                        : viewPaymentOrder.payment_status === 'REJECTED'
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
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
                        isZoomed ? 'max-h-[calc(100dvh-16rem)] w-full scale-105' : 'max-h-72 w-auto'
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
                    className="btn btn-outline btn-error font-bold min-h-[42px] h-[42px] px-4 rounded-xl text-sm"
                  >
                    Reject Claim
                  </button>
                  <button
                    type="button"
                    disabled={
                      patchOrderMutation.isPending ||
                      isLoadingProof ||
                      (!viewPaymentProof?.has_proof &&
                        !viewPaymentProof?.proof_base64 &&
                        !viewPaymentProof?.reference_number &&
                        !viewPaymentOrder.reference_number)
                    }
                    onClick={() => handleVerifyPayment(viewPaymentOrder.id)}
                    className="btn btn-primary font-bold px-6 min-h-[42px] h-[42px] rounded-xl text-sm text-white"
                  >
                    {patchOrderMutation.isPending ? 'Verifying...' : 'Verify Payment'}
                  </button>
                </div>
              )}
          </div>
        )}
      </Modal>

      {/* Order Cancellation Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancelOrderTarget)}
        onClose={closeModals}
        cardRef={cancelModalRef}
        size="md"
        headerVariant="danger"
        closeAriaLabel="Keep order"
        icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        title={cancelOrderTarget ? `Cancel Order #${cancelOrderTarget.order_number}?` : 'Cancel Order'}
      >
        {cancelOrderTarget && (
          <form onSubmit={handleConfirmCancelOrder} className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
              <div className="flex justify-between font-bold text-gray-800">
                <span>Order Total</span>
                <span className="text-[#0b3d91]">{formatPeso(cancelOrderTarget.total)}</span>
              </div>
              <div className="text-gray-600">
                {formatFulfillment(cancelOrderTarget.fulfillment)} · {formatPaymentMethod(cancelOrderTarget.payment_method)}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5 leading-relaxed">
              <p className="font-bold">Before you cancel:</p>
              <p>Cancelling this order immediately releases the reserved water stock and cannot be undone.</p>
              {isAdmin &&
              (cancelOrderTarget.payment_status === 'VERIFIED' || cancelOrderTarget.payment_status === 'COMPLETED') ? (
                <p className="font-semibold text-red-800">
                  Payment was already verified — cancelling will mark this order as Refund Required.
                </p>
              ) : (cancelOrderTarget.payment_method || '').toUpperCase() !== 'CASH' ? (
                <p>
                  No verified payment is recorded yet. If you already transferred funds, please contact the station ({COPY.ABOUT.EMAIL}).
                </p>
              ) : (
                <p>No cash payment has been collected, so no refund is needed.</p>
              )}
            </div>

            {cancelError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {cancelError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="cancel-reason-select" className="block text-xs font-bold text-gray-700">
                Reason for cancellation <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <select
                id="cancel-reason-select"
                value={cancelReasonChoice}
                onChange={(e) => setCancelReasonChoice(e.target.value)}
                className="select select-bordered select-sm w-full bg-white text-xs h-10 rounded-xl"
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {cancelReasonChoice === 'Other' && (
                <textarea
                  value={cancelOtherText}
                  onChange={(e) => setCancelOtherText(e.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={2}
                  placeholder="Share optional details (max 200 characters)"
                  className="textarea textarea-bordered w-full bg-white text-xs rounded-xl"
                />
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={closeModals}
                className="btn btn-ghost min-h-[44px] px-5 rounded-xl font-bold text-xs border border-gray-300"
              >
                Keep order
              </button>
              <button
                type="submit"
                disabled={patchOrderMutation.isPending}
                className="btn btn-error text-white min-h-[44px] px-6 rounded-xl font-bold text-xs shadow-sm"
              >
                {patchOrderMutation.isPending ? 'Cancelling...' : 'Cancel order'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
