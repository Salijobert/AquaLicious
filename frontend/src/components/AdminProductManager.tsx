import React, { useState } from 'react';
import { useCreateProduct, useUpdateProduct, useProducts } from '../api/client.js';
import { Plus, Search, Edit2, ShoppingCart, Eye } from 'lucide-react';

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

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {/* TOOLBAR */}
      <div className="toolbar bg-white p-3 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="search-wrap flex-1 max-w-sm relative">
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
                  const isLow = p.stock <= p.reorder_pt;
                  return (
                    <tr key={p.id}>
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
                        <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`}>
                          {isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2 items-center">
                          {onAddToCart && (
                            <button
                              data-action="add"
                              data-id={p.id}
                              onClick={() => onAddToCart(p)}
                              disabled={p.stock <= 0}
                              className="btn btn-primary btn-xs"
                            >
                              <ShoppingCart className="w-3 h-3 mr-1" /> Order
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => openEditModal(p)}
                              className="btn btn-outline btn-xs"
                            >
                              <Edit2 className="w-3 h-3 mr-1" /> Edit
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
