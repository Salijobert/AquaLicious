import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useLocation, Link } from 'react-router-dom';
import { useInventory, useOrders } from '../api/client.js';
import { Bell, Menu, Server, ShoppingCart } from 'lucide-react';
import { resolver } from '../api/multiServerResolver.js';

interface NavbarProps {
  cartCount?: number;
  onOpenCart?: () => void;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount = 0, onOpenCart, onToggleSidebar }) => {
  const { user, role } = useAuth();
  const location = useLocation();
  const { data: inventory } = useInventory();
  const { data: orders } = useOrders();

  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Compute page title based on current pathname
  const path = location.pathname.toLowerCase();
  let pageTitle = 'Dashboard';
  if (path.includes('sales')) pageTitle = 'Sales Transactions';
  else if (path.includes('inventory')) pageTitle = 'Inventory Monitoring';
  else if (path.includes('products')) pageTitle = 'Manage Products';
  else if (path.includes('reports')) pageTitle = 'Reports & Analytics';
  else if (path.includes('orders')) pageTitle = 'Orders Management';
  else if (path.includes('users')) pageTitle = 'User Management';
  else if (path.includes('settings')) pageTitle = 'Server Cluster';

  // Compute low stock items & pending orders for notifications
  const lowStock = inventory?.filter((p: any) => p.stock <= p.effective_rop) || [];
  const pendingOrders = orders?.filter((o: any) => o.status === 'PENDING') || [];
  const notifCount = lowStock.length + pendingOrders.length;

  // Format today's date in PH locale (e.g., "Mon, Oct 26, 2026")
  const formattedDate = new Date().toLocaleDateString('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="topbar-title m-0">{pageTitle}</span>
      </div>

      <div className="topbar-right">
        {/* Cart Button */}
        {onOpenCart && (
          <button
            data-id="cart"
            onClick={onOpenCart}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:border-blue-500 hover:text-blue-600 cursor-pointer relative transition-colors"
            aria-label="View Cart"
            title="View Cart"
          >
            <ShoppingCart className="w-4 h-4 text-gray-700" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#1565c0] text-white text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}

        {/* Server status */}
        <Link
          to="/settings"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs text-blue-800 bg-[#e3f2fd] px-2.5 py-1 rounded-full font-medium hover:bg-blue-100"
          title={`Active Server: ${resolver.getActiveServer()}`}
        >
          <Server className="w-3.5 h-3.5 text-[#1565c0]" />
          <span>Cluster Online</span>
        </Link>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:border-blue-500 hover:text-blue-600 cursor-pointer relative transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#c62828] text-white text-[10px] font-bold flex items-center justify-center">
                {notifCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 top-11 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-900 flex justify-between items-center">
                <span>Notifications ({notifCount})</span>
                <button
                  onClick={() => setIsNotifOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  Close
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 text-xs">
                {pendingOrders.map((o: any) => (
                  <Link
                    key={o.id}
                    to="/orders.html"
                    onClick={() => setIsNotifOpen(false)}
                    className="p-3 hover:bg-blue-50 flex items-start gap-2 text-gray-800 block"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                    <div>
                      <div className="font-bold">🛒 New Order #{o.order_number}</div>
                      <div className="text-[11px] text-gray-500">
                        ₱{Number(o.total).toFixed(2)} · {o.fulfillment}
                      </div>
                    </div>
                  </Link>
                ))}
                {lowStock.map((p: any) => (
                  <Link
                    key={p.id}
                    to="/inventory.html"
                    onClick={() => setIsNotifOpen(false)}
                    className="p-3 hover:bg-orange-50 flex items-start gap-2 text-gray-800 block"
                  >
                    <span
                      className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                        p.stock === 0 ? 'bg-red-600' : 'bg-orange-500'
                      }`}
                    />
                    <div>
                      <div className="font-bold">{p.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {p.stock === 0
                          ? 'Out of stock'
                          : `Low stock: ${p.stock} left (ROP: ${p.effective_rop})`}
                      </div>
                    </div>
                  </Link>
                ))}
                {notifCount === 0 && (
                  <div className="p-4 text-center text-gray-400">
                    ✅ No new notifications.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date */}
        <span className="topbar-date hidden md:inline-block">{formattedDate}</span>

        {/* Role Badge */}
        <span className="topbar-badge">
          {role === 'Administrator' ? 'Admin' : role || 'Staff'}
        </span>
      </div>
    </header>
  );
};
