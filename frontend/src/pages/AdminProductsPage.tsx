import React, { Suspense } from 'react';
import { AdminProductManager } from '../components/AdminProductManager.js';

export const AdminProductsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading products management...</div>}>
        <AdminProductManager />
      </Suspense>
    </div>
  );
};

export default AdminProductsPage;
