import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { ShieldAlert, Droplet } from 'lucide-react';

export const PageLoadingSpinner: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8">
    <div className="relative">
      <div className="w-12 h-12 rounded-full border-4 border-[#e3f2fd] border-t-[#1565c0] animate-spin" />
      <Droplet className="w-5 h-5 text-[#1565c0] fill-[#1565c0] absolute inset-0 m-auto" />
    </div>
    <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">
      Verifying Authorization...
    </span>
  </div>
);

interface RequireAuthProps {
  children: React.ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageLoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

interface RequireRoleProps {
  children: React.ReactNode;
  allowedRoles: Array<'Administrator' | 'Customer'>;
  fallbackPath?: string;
}

export const RequireRole: React.FC<RequireRoleProps> = ({
  children,
  allowedRoles,
  fallbackPath = '/'
}) => {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageLoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!role || !allowedRoles.includes(role)) {
    // If user is a customer, redirect to customer area
    if (role === 'Customer') {
      return <Navigate to={fallbackPath} replace />;
    }

    // Otherwise show 403 Forbidden
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="card max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-red-200 text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">403 - Access Forbidden</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your current account role (<strong>{role}</strong>) does not have permission to access this administrative feature.
          </p>
          <button
            onClick={() => window.history.back()}
            className="btn btn-outline btn-sm font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
