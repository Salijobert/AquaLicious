import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Package,
  ClipboardList,
  BarChart3,
  Users,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const links = [
    {
      to: '/dashboard',
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['Administrator']
    },
    {
      to: '/sales',
      id: 'sales',
      label: 'Sales (POS)',
      icon: ShoppingCart,
      roles: ['Administrator']
    },
    {
      to: '/inventory',
      id: 'inventory',
      label: 'Inventory',
      icon: Boxes,
      roles: ['Administrator']
    },
    {
      to: '/admin/products',
      id: 'products',
      label: 'Products',
      icon: Package,
      roles: ['Administrator']
    },
    {
      to: '/orders',
      id: 'orders',
      label: 'Orders',
      icon: ClipboardList,
      roles: ['Administrator', 'Customer']
    },
    {
      to: '/reports',
      id: 'reports',
      label: 'Reports & Analytics',
      icon: BarChart3,
      roles: ['Administrator']
    },
    {
      to: '/users',
      id: 'users',
      label: 'Users',
      icon: Users,
      roles: ['Administrator']
    }
  ];

  const allowedLinks = links.filter((l) => role && l.roles.includes(role));
  const initial = (user?.name?.[0] || user?.username?.[0] || '?').toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar fixed top-0 bottom-0 left-0 z-50 w-[240px] bg-white border-r border-[#e3f2fd] flex flex-col shadow-sm transition-transform duration-250 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header: Admin sidebar logo links directly to /dashboard */}
        <Link to="/dashboard" onClick={onClose} className="sidebar-brand cursor-pointer">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24">
              <path d="M12 2C8 7 4 10.5 4 14a8 8 0 0016 0c0-3.5-4-7-8-12z" />
            </svg>
          </div>
          <span className="brand-name">AquaLicious</span>
        </Link>

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Main Menu</div>
            {allowedLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  onClick={onClose}
                  data-id={link.id}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer with Logged In User Info */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{initial}</div>
            <div className="user-info truncate">
              <div className="user-name truncate">{user?.name || user?.username || '—'}</div>
              <div className="user-role">{role || '—'}</div>
            </div>
          </div>
          <button
            className="btn-logout"
            onClick={async () => {
              queryClient.clear();
              await logout();
              navigate('/', { replace: true });
            }}
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </aside>
    </>
  );
};
