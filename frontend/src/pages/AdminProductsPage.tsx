import React, { Suspense } from 'react';
import { AdminProductManager } from '../components/AdminProductManager.js';

export const AdminProductsPage: React.FC = () => {
  return (
    <main id="main-content" className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold text-[#0b3d91]">Products Management</h1>
      </div>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading products management...</div>}>
        <AdminProductManager />
      </Suspense>
    </main>
  );
};

export default AdminProductsPage;
