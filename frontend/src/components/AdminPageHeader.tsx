import React from 'react';

export interface AdminPageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  subtitle,
  actions,
  children
}) => {
  return (
    <div className="admin-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100/60">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold font-serif text-[#0b3d91] tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-500 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
};

export default AdminPageHeader;
