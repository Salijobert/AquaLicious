import React, { useState } from 'react';
import { useProducts, useCreateProduct, useUpdateProduct } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Package, Plus, Edit, PlusCircle, ShoppingCart } from 'lucide-react';

interface ProductsPageProps {
  onAddToCart?: (product: any) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onAddToCart }) => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';
  const { data: products, isLoading, error } = useProducts(isAdmin);
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();

  const [activeTab, setActiveTab] = useState<string>('All');
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
  const filteredProducts = products?.filter((p: any) =>
    activeTab === 'All' ? true : p.category === activeTab
  );

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await updateProductMutation.mutateAsync({
          id: editingProduct.id,
          ...formData
        });
        setEditingProduct(null);
      } else {
        await createProductMutation.mutateAsync(formData);
        setIsCreateOpen(false);
      }
      setFormData({
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
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Product Catalog</h1>
          <p className="text-xs text-slate-500 font-semibold">Refills, Containers & Station Inventory</p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsCreateOpen(true);
            }}
            className="btn btn-primary btn-sm gap-2 font-bold shadow"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`btn btn-sm text-xs font-bold rounded-lg ${
              activeTab === cat ? 'btn-primary' : 'btn-outline border-slate-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Cards Grid */}
      <div className="catalog grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts?.map((p: any) => (
          <div
            key={p.id}
            className="product card bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <span className="badge badge-secondary badge-outline text-[11px] font-bold">
                  {p.category} · {p.product_type}
                </span>
                <span className={`badge badge-sm font-bold ${p.active ? 'badge-ghost' : 'badge-error text-white'}`}>
                  {p.active ? 'Active' : 'Archived'}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mt-2">{p.name}</h3>
              <div className="muted text-xs text-slate-400 font-mono">{p.sku} · {p.volume_label}</div>

              <div className="price text-xl font-black text-primary mt-3">
                ₱{Number(p.selling_price).toFixed(2)}
              </div>

              {isAdmin && p.production_cost !== undefined && (
                <div className="text-xs text-slate-500 mt-1">
                  Cost: <strong>₱{Number(p.production_cost).toFixed(2)}</strong> · Margin: ₱{(Number(p.selling_price) - Number(p.production_cost)).toFixed(2)}
                </div>
              )}

              <div className="text-xs text-slate-600 mt-2">
                Stock: <strong className="font-bold text-slate-900">{p.stock}</strong> units
                {p.stock <= p.reorder_pt && (
                  <span className="badge badge-error badge-xs text-white ml-2 font-bold">Low Stock</span>
                )}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {onAddToCart ? (
                <button
                  data-action="add"
                  data-id={p.id}
                  onClick={() => onAddToCart(p)}
                  disabled={p.stock <= 0}
                  className="btn btn-primary btn-sm flex-1 gap-1 font-bold text-xs"
                >
                  <PlusCircle className="w-4 h-4" /> Add to Cart
                </button>
              ) : null}

              {isAdmin && (
                <button
                  onClick={() => {
                    setEditingProduct(p);
                    setFormData({
                      sku: p.sku,
                      name: p.name,
                      category_id: p.category_id,
                      product_type: p.product_type,
                      volume_label: p.volume_label,
                      selling_price: p.selling_price,
                      production_cost: p.production_cost || '0',
                      reorder_pt: String(p.reorder_pt),
                      lead_time_days: String(p.lead_time_days),
                      safety_stock: String(p.safety_stock)
                    });
                  }}
                  className="btn btn-outline btn-sm gap-1 text-xs"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Admin Create/Edit Modal */}
      {(isCreateOpen || editingProduct) && (
        <dialog open className="modal modal-open z-50">
          <div className="modal-box bg-white text-slate-800 max-w-md p-6 rounded-2xl shadow-2xl">
            <h3 className="font-bold text-lg text-primary mb-4">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
              <div>
                <label className="label font-bold pb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label font-bold pb-1">SKU</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingProduct}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800 uppercase"
                  />
                </div>
                <div>
                  <label className="label font-bold pb-1">Volume Label</label>
                  <input
                    type="text"
                    value={formData.volume_label}
                    onChange={(e) => setFormData({ ...formData, volume_label: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label font-bold pb-1">Selling Price (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
                <div>
                  <label className="label font-bold pb-1">Production Cost (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.production_cost}
                    onChange={(e) => setFormData({ ...formData, production_cost: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label font-bold pb-1">Min ROP</label>
                  <input
                    type="number"
                    value={formData.reorder_pt}
                    onChange={(e) => setFormData({ ...formData, reorder_pt: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
                <div>
                  <label className="label font-bold pb-1">Lead Days</label>
                  <input
                    type="number"
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
                <div>
                  <label className="label font-bold pb-1">Safety Stock</label>
                  <input
                    type="number"
                    value={formData.safety_stock}
                    onChange={(e) => setFormData({ ...formData, safety_stock: e.target.value })}
                    className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  />
                </div>
              </div>

              <div className="modal-action flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingProduct(null);
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm font-bold">
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
};
