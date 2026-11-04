import React, { useState, useEffect, useRef } from 'react';
import {
  useCreateProduct,
  useUpdateProduct,
  useProducts,
  useDeleteProduct,
  useRestoreProduct,
  useProductUsage
} from '../api/client.js';
import {
  Plus,
  Search,
  Edit2,
  ShoppingCart,
  Eye,
  Trash2,
  RotateCcw,
  Archive,
  AlertTriangle,
  Loader2,
  X
} from 'lucide-react';

interface AdminProductManagerProps {
  products?: any[];
  isAdmin?: boolean;
  onAddToCart?: (product: any, quantity?: number) => void;
  onSwitchToCustomerView?: () => void;
}

export const AdminProductManager: React.FC<AdminProductManagerProps> = ({
  products: productsProp,
  isAdmin = true,
  onAddToCart,
  onSwitchToCustomerView
}) => {
  const { data: fetchedProducts } = useProducts(true);
  const products = productsProp || fetchedProducts || [];

  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const restoreProductMutation = useRestoreProduct();

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Edit / Create modal state
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete / Archive confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [zeroStockChecked, setZeroStockChecked] = useState<boolean>(false);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteActionError, setDeleteActionError] = useState<string | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const deleteModalRef = useRef<HTMLDivElement>(null);

  // Product usage details query for delete target
  const {
    data: usageData,
    isLoading: isUsageLoading,
    error: usageQueryError
  } = useProductUsage(deleteTarget?.id);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category_id: 1,
    product_type: 'REFILL',
    volume_label: '5-Gallon',
    selling_price: '',
    production_cost: '',
    reorder_pt: '20',
    lead_time_days: '2',
    safety_stock: '10'
  });

  const categories = ['All', 'Slim', 'Round', 'Purified', 'Mineral'];

  const filteredProducts = products?.filter((p: any) => {
    // Hide archived by default unless showArchived is checked
    const isProductArchived = p.active === false || p.active === 0 || p.active === '0';
    if (!showArchived && isProductArchived) return false;
    const matchesCat = activeCategory === 'All' ? true : p.category === activeCategory;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesCat && matchesSearch;
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setModalError(null);
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      name: '',
      category_id: 1,
      product_type: 'REFILL',
      volume_label: '5-Gallon',
      selling_price: '',
      production_cost: '',
      reorder_pt: '20',
      lead_time_days: '2',
      safety_stock: '10'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingProduct(p);
    setModalError(null);
    setFormData({
      sku: p.sku,
      name: p.name,
      category_id: p.category_id || (p.category === 'Slim' ? 1 : p.category === 'Round' ? 2 : p.category === 'Purified' ? 3 : p.category === 'Mineral' ? 4 : 5),
      product_type: p.product_type || 'REFILL',
      volume_label: p.volume_label || '5-Gallon',
      selling_price: String(p.selling_price),
      production_cost: String(p.production_cost || ''),
      reorder_pt: String(p.reorder_pt || 20),
      lead_time_days: String(p.lead_time_days || 2),
      safety_stock: String(p.safety_stock || 10)
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      if (editingProduct) {
        await updateProductMutation.mutateAsync({
          id: editingProduct.id,
          ...formData
        });
      } else {
        await createProductMutation.mutateAsync(formData);
      }
      setIsModalOpen(false);
      setEditingProduct(null);
    } catch (err: any) {
      setModalError(err.message || 'Operation failed');
    }
  };

  // Open Delete Modal
  const openDeleteModal = (p: any) => {
    setDeleteTarget(p);
    setZeroStockChecked(false);
    setDeleteReason('');
    setDeleteActionError(null);
  };

  const closeDeleteModal = () => {
    if (deleteProductMutation.isPending) return;
    setDeleteTarget(null);
    setDeleteActionError(null);
  };

  // Handle Confirm Delete / Archive
  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteProductMutation.isPending) return;
    setDeleteActionError(null);
    try {
      const res = await deleteProductMutation.mutateAsync({
        id: deleteTarget.id,
        zero_stock: zeroStockChecked,
        reason: deleteReason || undefined
      });
      const actionTaken = res?.action || (usageData?.can_delete ? 'deleted' : 'archived');
      setToastMessage({
        type: 'success',
        text:
          actionTaken === 'deleted'
            ? `Product "${deleteTarget.name}" was permanently deleted.`
            : `Product "${deleteTarget.name}" was archived. Historical orders and reports remain intact.`
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteActionError(err.message || 'Failed to delete or archive product');
    }
  };

  // Handle Restore
  const handleRestore = async (p: any) => {
    try {
      await restoreProductMutation.mutateAsync(p.id);
      setToastMessage({
        type: 'success',
        text: `Product "${p.name}" restored successfully.`
      });
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err.message || 'Failed to restore product'
      });
    }
  };

  // Keyboard accessibility and Android back button for Delete Modal
  useEffect(() => {
    if (!deleteTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteProductMutation.isPending) {
        closeDeleteModal();
      }
      if (e.key === 'Tab' && deleteModalRef.current) {
        const focusable = deleteModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && (document.activeElement === first || !deleteModalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !deleteModalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const handleBackButton = (e: Event) => {
      if (!deleteProductMutation.isPending) {
        e.preventDefault();
        closeDeleteModal();
      }
    };

    document.addEventListener('backbutton', handleBackButton);
    const capApp = (window as any).Capacitor?.Plugins?.App;
    let capListenerHandle: any = null;
    if (capApp?.addListener) {
      capApp
        .addListener('backButton', () => {
          if (!deleteProductMutation.isPending) {
            closeDeleteModal();
          }
        })
        .then((handle: any) => {
          capListenerHandle = handle;
        })
        .catch(() => {});
    }

    // Auto-focus the modal container or cancel button
    if (deleteModalRef.current) {
      deleteModalRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('backbutton', handleBackButton);
      if (capListenerHandle && typeof capListenerHandle.remove === 'function') {
        capListenerHandle.remove();
      }
    };
  }, [deleteTarget, deleteProductMutation.isPending]);

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-xs animate-fadeIn ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-gray-400 hover:text-gray-600 ml-3 text-sm leading-none"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="toolbar bg-white p-3 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] flex-wrap">
          <div className="search-wrap flex-1 max-w-sm relative min-w-[180px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="search-input"
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: '160px' }}
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Categories' : c}
              </option>
            ))}
          </select>

          {/* Archived Toggle Filter */}
          {isAdmin && (
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 transition-colors select-none">
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span className="flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-gray-500" />
                Show Archived
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToCustomerView && (
            <button
              onClick={onSwitchToCustomerView}
              className="btn btn-outline btn-sm gap-1.5 font-bold"
            >
              <Eye className="w-3.5 h-3.5" /> Customer View
            </button>
          )}
          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="btn btn-primary btn-sm gap-1.5 font-bold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Product
            </button>
          )}
        </div>
      </div>

      <div className="card bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="card-header p-4 border-b border-gray-100 flex justify-between items-center">
          <span className="card-title font-bold text-slate-800">🛒 Product List</span>
          <span className="text-xs text-gray-500 font-semibold">{filteredProducts?.length || 0} product(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Unit Price</th>
                <th>Production Cost</th>
                <th>Stock</th>
                <th>Reorder Pt.</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts && filteredProducts.length > 0 ? (
                filteredProducts.map((p: any, i: number) => {
                  const isArchived = p.active === false || p.active === 0 || p.active === '0';
                  const isLow = !isArchived && p.stock <= p.reorder_pt;
                  return (
                    <tr key={p.id} className={isArchived ? 'opacity-70 bg-slate-50/50' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{p.name}{p.volume_label ? ` · ${p.volume_label}` : ''}</strong>
                        <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                      </td>
                      <td>
                        <span className="badge badge-info">{p.category}</span>
                      </td>
                      <td className="font-bold text-gray-900">₱{Number(p.selling_price).toFixed(2)}</td>
                      <td className="text-gray-500">₱{Number(p.production_cost || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: isLow ? 700 : 400, color: isLow ? 'var(--red)' : 'inherit' }}>
                        {p.stock}
                      </td>
                      <td>{p.reorder_pt}</td>
                      <td>
                        {isArchived ? (
                          <span className="badge badge-neutral bg-slate-600 text-white font-medium">
                            Archived
                          </span>
                        ) : (
                          <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`}>
                            {isLow ? 'Low Stock' : 'In Stock'}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {/* Active products: Order, Edit, Delete */}
                          {!isArchived && onAddToCart && (
                            <button
                              data-action="add"
                              data-id={p.id}
                              onClick={() => onAddToCart(p)}
                              disabled={p.stock <= 0}
                              className="btn btn-primary btn-xs"
                              aria-label={`Order ${p.name}`}
                            >
                              <ShoppingCart className="w-3 h-3 mr-1" /> Order
                            </button>
                          )}
                          {!isArchived && isAdmin && (
                            <>
                              <button
                                onClick={() => openEditModal(p)}
                                className="btn btn-outline btn-xs"
                                aria-label={`Edit ${p.name}`}
                              >
                                <Edit2 className="w-3 h-3 mr-1" /> Edit
                              </button>
                              <button
                                onClick={() => openDeleteModal(p)}
                                className="btn btn-outline btn-error btn-xs gap-1"
                                aria-label={`Delete ${p.name}`}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Delete
                              </button>
                            </>
                          )}

                          {/* Archived products: Restore action */}
                          {isArchived && isAdmin && (
                            <button
                              onClick={() => handleRestore(p)}
                              disabled={restoreProductMutation.isPending}
                              className="btn btn-outline btn-success btn-xs gap-1"
                              aria-label={`Restore ${p.name}`}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" /> Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION MODAL FOR DELETE / ARCHIVE */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          tabIndex={-1}
          ref={deleteModalRef}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h2 id="delete-modal-title" className="text-base sm:text-lg font-bold text-slate-800">
                  {usageData?.can_delete ? 'Delete Product' : 'Archive Product'}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-circle btn-sm text-gray-400 hover:text-gray-600"
                onClick={closeDeleteModal}
                disabled={deleteProductMutation.isPending}
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-700">
              {/* Product Summary Details */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Product Name:</span>
                  <span className="font-bold text-slate-900">{deleteTarget.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">SKU:</span>
                  <span className="font-mono text-slate-800">{deleteTarget.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Volume:</span>
                  <span className="text-slate-800">{deleteTarget.volume_label || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Current Stock:</span>
                  <span className={`font-bold ${deleteTarget.stock > 0 ? 'text-blue-600' : 'text-slate-500'}`}>
                    {deleteTarget.stock} units
                  </span>
                </div>
              </div>

              {/* Usage / Dependency Check State */}
              {isUsageLoading ? (
                <div className="flex items-center justify-center py-4 gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking product history and active orders...</span>
                </div>
              ) : usageQueryError ? (
                <div className="alert alert-error text-xs p-3">
                  <span>Unable to verify product references: {(usageQueryError as any)?.message}</span>
                </div>
              ) : usageData?.is_blocked ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    Cannot Delete or Archive: Active Orders Pending
                  </div>
                  <p>
                    This product is referenced in <strong>{usageData.active_orders_count}</strong> active order(s) (pending fulfillment, preparation, or refund verification). Please fulfill or cancel those orders before removing this product.
                  </p>
                </div>
              ) : usageData?.is_used ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-2">
                  <div className="font-bold text-blue-800">Product Has Transaction History</div>
                  <p>
                    This product has order or stock history (<strong>{usageData.sales_count}</strong> sales,{' '}
                    <strong>{usageData.movements_count}</strong> stock movements), so it will be{' '}
                    <strong>archived instead of deleted</strong>. It will be hidden from the storefront, POS and
                    inventory, but past orders and reports stay intact.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1">
                  <div className="font-bold text-emerald-800">Unused Product</div>
                  <p>
                    This will permanently delete this product. There are no associated order items, sales items, or stock ledger records.
                  </p>
                </div>
              )}

              {/* Stock Warning & Option to Set Stock to 0 */}
              {deleteTarget.stock > 0 && !usageData?.is_blocked && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-2">
                  <div className="font-semibold text-amber-900">
                    ⚠️ {deleteTarget.stock} units remain in stock.
                  </div>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Archived products disappear from the Inventory page and cannot be restocked or adjusted while archived. If you wish to clear remaining inventory, you may record an audited adjustment now, or restore the product later to make adjustments.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer pt-1 font-semibold text-slate-800 select-none">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-warning"
                      checked={zeroStockChecked}
                      onChange={(e) => setZeroStockChecked(e.target.checked)}
                      disabled={deleteProductMutation.isPending}
                    />
                    <span>Set stock to 0 first (records an audited ledger adjustment)</span>
                  </label>
                </div>
              )}

              {/* Optional Reason Input */}
              {!usageData?.is_blocked && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600">
                    Reason (optional audit note):
                  </label>
                  <input
                    type="text"
                    className="form-control text-xs"
                    placeholder="e.g. Discontinued packaging / entered in error"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    disabled={deleteProductMutation.isPending}
                  />
                </div>
              )}

              {/* Inline Action Error */}
              {deleteActionError && (
                <div className="alert alert-error text-xs p-2.5">
                  <span>{deleteActionError}</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-gray-100 flex items-center justify-end gap-2 bg-slate-50 shrink-0">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={closeDeleteModal}
                disabled={deleteProductMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-sm font-bold gap-1.5 ${
                  usageData?.can_delete ? 'btn-error text-white' : 'btn-warning text-slate-900'
                }`}
                onClick={handleConfirmDelete}
                disabled={
                  deleteProductMutation.isPending ||
                  isUsageLoading ||
                  Boolean(usageData?.is_blocked)
                }
              >
                {deleteProductMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                  </>
                ) : usageData?.can_delete ? (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" /> Archive Product
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal aq-modal" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>
            {modalError && (
              <div className="p-2.5 mb-3 text-xs text-red-600 bg-red-50 rounded-lg border border-red-200">
                {modalError}
              </div>
            )}
            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input
                    required
                    className="form-control"
                    placeholder="e.g. Slim Bottle 500ml"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-control"
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: Number(e.target.value) })}
                  >
                    <option value={1}>Slim</option>
                    <option value={2}>Round</option>
                    <option value={3}>Purified</option>
                    <option value={4}>Mineral</option>
                    <option value={5}>Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">SKU Code *</label>
                  <input
                    required
                    className="form-control"
                    placeholder="e.g. SLIM-500"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Volume Label</label>
                  <input
                    className="form-control"
                    placeholder="e.g. 5-Gallon, 500ml"
                    value={formData.volume_label}
                    onChange={(e) => setFormData({ ...formData, volume_label: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Unit Price (₱) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    className="form-control"
                    placeholder="0.00"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Production Cost (₱) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    className="form-control"
                    placeholder="0.00"
                    value={formData.production_cost}
                    onChange={(e) => setFormData({ ...formData, production_cost: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Reorder Point (ROP) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="form-control"
                    placeholder="20"
                    value={formData.reorder_pt}
                    onChange={(e) => setFormData({ ...formData, reorder_pt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Lead Time (days) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="form-control"
                    placeholder="2"
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-4 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProductMutation.isPending || updateProductMutation.isPending}
                  className="btn btn-primary"
                >
                  {createProductMutation.isPending || updateProductMutation.isPending
                    ? 'Saving...'
                    : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductManager;