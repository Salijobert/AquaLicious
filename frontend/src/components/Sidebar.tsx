import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Package,
  ClipboardList,
  BarChart3,
  Users,
  ServerCog
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { role } = useAuth();

  const links = [
    {
      to: '/dashboard.html',
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['Administrator', 'Staff']
    },
    {
      to: '/sales.html',
      id: 'sales',
      label: 'Sales (POS)',
      icon: ShoppingCart,
      roles: ['Administrator', 'Staff']
    },
    {
      to: '/inventory.html',
      id: 'inventory',
      label: 'Inventory',
      icon: Boxes,
      roles: ['Administrator', 'Staff']
    },
    {
      to: '/products.html',
      id: 'products',
      label: 'Products',
      icon: Package,
      roles: ['Administrator', 'Staff', 'Customer']
    },
    {
      to: '/orders.html',
      id: 'orders',
      label: 'Orders',
      icon: ClipboardList,
      roles: ['Administrator', 'Staff', 'Customer']
    },
    {
      to: '/reports.html',
      id: 'reports',
      label: 'Reports & Analytics',
      icon: BarChart3,
      roles: ['Administrator', 'Staff']
    },
    {
      to: '/users.html',
      id: 'users',
      label: 'User Management',
      icon: Users,
      roles: ['Administrator']
    },
    {
      to: '/settings',
      id: 'settings',
      label: 'Server Cluster',
      icon: ServerCog,
      roles: ['Administrator', 'Staff', 'Customer']
    }
  ];

  const allowedLinks = links.filter(l => role && l.roles.includes(role));

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-200 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-800">
          <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">
            Station Management
          </div>
        </div>

        <nav className="p-2 space-y-1">
          {allowedLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onClose}
                data-id={link.id}
                className={({ isActive }) =>
                  `nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-secondary text-slate-900 font-bold shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
