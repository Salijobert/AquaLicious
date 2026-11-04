import React, { Suspense } from 'react';
import { AdminProductManager } from '../components/AdminProductManager.js';
import { AdminPageHeader } from '../components/AdminPageHeader.js';

export const AdminProductsPage: React.FC = () => {
  return (
    <div className="page-content space-y-6">
      <AdminPageHeader
        title="Products"
        subtitle="Manage bottle inventory, price catalogs, active status, and volume options."
      />
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading products management...</div>}>
        <AdminProductManager />
      </Suspense>
    </div>
  );
};

export default AdminProductsPage;
