import React from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { Link, useNavigate } from 'react-router-dom';
import { Droplet, LogOut, Server, ShoppingCart, User as UserIcon } from 'lucide-react';
import { resolver } from '../api/multiServerResolver.js';

interface NavbarProps {
  cartCount?: number;
  onOpenCart?: () => void;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount = 0, onOpenCart, onToggleSidebar }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="navbar bg-primary text-primary-content shadow-md sticky top-0 z-50 px-4 flex justify-between items-center h-16">
      <div className="flex items-center gap-2">
        {user && (
          <button
            onClick={onToggleSidebar}
            className="btn btn-ghost btn-circle lg:hidden text-white"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-wider text-white">
          <Droplet className="w-7 h-7 text-secondary fill-secondary" />
          <span>AQUALICIOUS</span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {/* Server Indicator */}
        <Link
          to="/settings"
          className="badge badge-sm badge-secondary hidden sm:flex items-center gap-1 text-xs px-2 py-1"
          title={`Active Server: ${resolver.getActiveServer()}`}
        >
          <Server className="w-3 h-3" />
          <span className="truncate max-w-[120px]">Cluster Online</span>
        </Link>

        {/* Customer Cart Button */}
        {role === 'Customer' && onOpenCart && (
          <button onClick={onOpenCart} className="btn btn-ghost btn-circle text-white relative" data-id="cart">
            <ShoppingCart className="w-6 h-6" />
            {cartCount > 0 && (
              <span className="badge badge-secondary badge-sm absolute -top-1 -right-1 font-bold">
                {cartCount}
              </span>
            )}
          </button>
        )}

        {/* User Info / Logout */}
        {user ? (
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-sm text-white flex items-center gap-2 cursor-pointer">
              <UserIcon className="w-4 h-4" />
              <span className="hidden md:inline font-semibold">{user.name}</span>
              <span className="badge badge-outline badge-xs text-white opacity-80">{user.role}</span>
            </label>
            <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 text-slate-800 rounded-box w-52">
              <li className="menu-title px-4 py-2 border-b">
                <span className="font-bold">{user.name}</span>
                <span className="text-xs text-slate-500">@{user.username} ({user.role})</span>
              </li>
              <li>
                <Link to="/settings">Server Settings</Link>
              </li>
              <li>
                <button onClick={handleLogout} className="text-error flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </li>
            </ul>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className="btn btn-sm btn-ghost text-white">
              Login
            </Link>
            <Link to="/register" className="btn btn-sm btn-secondary text-primary font-bold">
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
