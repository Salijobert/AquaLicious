import React from 'react';
import { useReports, useInventory } from '../api/client.js';
import { DollarSign, ShoppingBag, AlertTriangle, Package, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';

export const DashboardPage: React.FC = () => {
  const { role } = useAuth();
  const { data: report, isLoading: reportLoading, error: reportError } = useReports(30);
  const { data: inventory, isLoading: invLoading } = useInventory();

  const today = report?.today || { revenue: 0, transactions: 0, active_products: 0, low_stock: 0 };
  const trend = report?.trend || { sma: 0, slope: 0, percentage_slope: 0, label: 'Stable' };
  const alerts = inventory?.filter((p: any) => p.status === 'Critical' || p.status === 'Warning') || [];

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {reportError ? (reportError as any).message : ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-xs text-slate-500 font-semibold">Today's Sales & Operational Overview</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Today's Revenue</span>
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            ₱{Number(today.revenue).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Live recorded cash/QR</div>
        </div>

        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Transactions</span>
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            {today.transactions}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Checkouts completed</div>
        </div>

        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Active Products</span>
            <Package className="w-5 h-5 text-secondary" />
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            {today.active_products}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Catalog items listed</div>
        </div>

        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Low Stock</span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="stat-value text-2xl font-black text-amber-600">
            {alerts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Items at or below ROP</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* 7-Day Trend Card */}
        <div className="lg:col-span-2 card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">7-Day Sales Trend & Forecast</h2>
              <p className="text-xs text-slate-500">Simple Moving Average & Least-Squares Slope</p>
            </div>
            <div className={`badge font-bold px-3 py-2 gap-1 text-xs ${
              trend.label === 'Growing' ? 'badge-success text-white' :
              trend.label === 'Declining' ? 'badge-error text-white' : 'badge-neutral text-slate-100'
            }`}>
              {trend.label === 'Growing' && <TrendingUp className="w-3.5 h-3.5" />}
              {trend.label === 'Declining' && <TrendingDown className="w-3.5 h-3.5" />}
              {trend.label === 'Stable' && <Minus className="w-3.5 h-3.5" />}
              {trend.label} ({trend.percentage_slope > 0 ? '+' : ''}{trend.percentage_slope}%)
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl mb-4 border text-center">
            <div>
              <div className="text-xs text-slate-400 font-semibold">7-Day Moving Average</div>
              <div className="text-xl font-black text-primary mt-1">₱{Number(trend.sma).toFixed(2)} / day</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 font-semibold">Daily Trend Slope</div>
              <div className="text-xl font-black text-slate-800 mt-1">₱{Number(trend.slope).toFixed(2)} / day</div>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            *Trend calculation is mathematically evaluated over the last 7 completed Asia/Manila calendar days.
            Today's partial sales are excluded from regression to prevent premature downward bias.
          </p>
        </div>

        {/* Reorder Alerts Section */}
        <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-slate-800 mb-1">Reorder alerts</h2>
          <p className="text-xs text-slate-500 mb-4">Dynamic threshold status</p>

          {alerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
              All inventory levels are within safe operating capacity.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((item: any) => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Stock: <strong className="text-slate-900">{item.stock}</strong> · ROP: {item.effective_rop}
                    </div>
                  </div>
                  <span className={`badge badge-sm font-bold ${
                    item.status === 'Critical' ? 'badge-error text-white' : 'badge-warning text-slate-900'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
