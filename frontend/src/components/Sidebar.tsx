import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const queryClient = useQueryClient();

  const asideRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

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

  // 1. Automatically close drawer on route change
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
  }, [location.pathname]);

  // 2. Automatically close drawer when screen resizes to desktop breakpoint (>= 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && isOpen) {
        onClose();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, onClose]);

  // 3. Body scroll locking while drawer is open on mobile
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  // 4. Focus Trap & Keyboard Navigation (Esc key to close, Tab loop inside drawer)
  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore focus on close
    triggerRef.current = document.activeElement as HTMLElement | null;

    // Focus the first navigation link or the aside panel itself
    const aside = asideRef.current;
    if (aside) {
      const focusable = aside.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        aside.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const aside = asideRef.current;
        if (!aside) return;
        const focusable = Array.from(
          aside.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to opening trigger button
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const sidebarContent = (
    <>
      {/* Mobile Backdrop Portaled into document.body with blur & full-bleed coverage */}
      {isOpen && (
        <div
          className="fixed inset-0 aq-drawer-backdrop z-[1000] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer Panel - Rendered at z-[1050] on mobile when open, docked z-50 on desktop */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={isOpen ? 'true' : undefined}
        aria-label="Admin Navigation Menu"
        className={`sidebar fixed top-0 bottom-0 left-0 w-[240px] bg-white border-r border-[#e3f2fd] flex flex-col shadow-sm transition-transform duration-250 ease-in-out lg:translate-x-0 outline-none ${
          isOpen
            ? 'translate-x-0 z-[1050] drawer-open'
            : '-translate-x-full z-50 lg:z-50'
        }`}
        style={{
          paddingTop: 'var(--safe-top, 0px)'
        }}
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

        {/* Sidebar Footer with Logged In User Info & Safe Area Handling */}
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

  return createPortal(sidebarContent, document.body);
};
