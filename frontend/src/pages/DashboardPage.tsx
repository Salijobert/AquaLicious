import React, { useState } from 'react';
import { useReports, useInventory, useSales } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { role } = useAuth();
  const { data: report, error: reportError } = useReports(30);
  const { data: inventory } = useInventory();
  const { data: salesHistory } = useSales();

  const today = report?.today || { revenue: 0, transactions: 0, active_products: 0, low_stock: 0 };
  const trend = report?.trend || { sma: 0, slope: 0, percentage_slope: 0, label: 'Stable' };
  const alerts = inventory?.filter((p: any) => p.status === 'Critical' || p.status === 'Warning') || [];
  const series = report?.series || [];

  // Compute last 7 days for the 7-day sales chart
  const last7Days = series.slice(-7);
  const maxDayRevenue = Math.max(...last7Days.map((d: any) => Number(d.revenue) || 0), 100);

  // Month name
  const currentMonthName = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const totalSalesCount = salesHistory?.length || report?.summary?.total_transactions || 0;
  const totalProductsCount = inventory?.length || today.active_products || 0;

  // Month selector for monthly revenue
  const [selectedMonth, setSelectedMonth] = useState<string>('current');

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {reportError ? (reportError as any).message : ''}
      </div>

      {/* STAT CARDS */}
      <div className="stat-grid" id="statGrid">
        <div className="stat-card">
          <div className="stat-label">Today's Revenue</div>
          <div className="stat-value">₱{Number(today.revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="stat-sub">{today.transactions} transaction{today.transactions !== 1 ? 's' : ''} today</div>
          <div className="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <text x="12" y="18.5" textAnchor="middle" fontSize="19" fontWeight="700" fontFamily="Poppins,Arial,sans-serif">₱</text>
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Sales</div>
          <div className="stat-value">{totalSalesCount}</div>
          <div className="stat-sub">All transactions recorded</div>
          <div className="stat-icon icon-green">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{totalProductsCount}</div>
          <div className="stat-sub">{[...new Set(inventory?.map((p: any) => p.category) || [])].length || 4} categories listed</div>
          <div className="stat-icon icon-orange">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6z" />
            </svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Revenue (This Month)</div>
          <div className="stat-value">₱{Number(report?.summary?.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="stat-sub">{currentMonthName}</div>
          <div className="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
            </svg>
          </div>
        </div>
      </div>

      {/* CHARTS ROW (Sales Last 7 Days + Forecast & Health) */}
      <div className="grid-2">
        {/* 7-Day Bar Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Sales – Last 7 Days</span>
          </div>
          <div className="card-body">
            <div className="chart-area" id="salesChart">
              {last7Days.length > 0 ? (
                last7Days.map((d: any, i: number) => {
                  const rev = Number(d.revenue) || 0;
                  const pct = Math.max(8, Math.round((rev / maxDayRevenue) * 100));
                  const dateObj = new Date(d.date + 'T00:00:00');
                  const dayLabel = dateObj.toLocaleDateString('en-PH', { weekday: 'short' });
                  const dateLabel = dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center min-w-0">
                      <span className="text-[10px] font-semibold text-gray-700 mb-1">
                        ₱{rev.toLocaleString()}
                      </span>
                      <div className="h-36 w-full flex items-end">
                        <div
                          className="bar w-full"
                          title={`${dateLabel}: ₱${rev.toLocaleString()}`}
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold mt-1.5 text-gray-800">{dayLabel}</span>
                      <span className="text-[10px] text-gray-500">{dateLabel}</span>
                    </div>
                  );
                })
              ) : (
                <div className="w-full text-center py-12 text-gray-400 text-xs">
                  Recording transactions will populate 7-day sales graph.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Business Health & Linear Regression Trend */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📈 Business Health & Forecast</span>
            <div
              className={`badge font-bold ${
                trend.label === 'Growing'
                  ? 'badge-success'
                  : trend.label === 'Declining'
                  ? 'badge-danger'
                  : 'badge-info'
              }`}
            >
              {trend.label === 'Growing' && <TrendingUp className="w-3.5 h-3.5 mr-1 inline" />}
              {trend.label === 'Declining' && <TrendingDown className="w-3.5 h-3.5 mr-1 inline" />}
              {trend.label === 'Stable' && <Minus className="w-3.5 h-3.5 mr-1 inline" />}
              {trend.label} ({trend.percentage_slope > 0 ? '+' : ''}{trend.percentage_slope}%)
            </div>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">7-Day Moving Avg</div>
                <div className="text-xl font-black text-[#1565c0] mt-1">
                  ₱{Number(trend.sma).toFixed(2)} <span className="text-xs font-medium text-gray-500">/ day</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Daily Trend Slope</div>
                <div className="text-xl font-black text-gray-900 mt-1">
                  {trend.slope >= 0 ? '+' : ''}₱{Number(trend.slope).toFixed(2)} <span className="text-xs font-medium text-gray-500">/ day</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-gray-600 leading-relaxed">
              <strong>Operating Insight:</strong> Trend evaluation uses a least-squares linear regression over the last 7 completed business days. Today's active register sales are isolated to prevent premature downward bias.
            </div>
          </div>
        </div>
      </div>

      {/* REORDER ALERTS (Strict requirement for Playwright test: role 'heading' name 'Reorder alerts') */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Reorder alerts</h2>
          <Link to="/inventory" className="btn btn-outline btn-sm">
            Manage Stock <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
        <div className="card-body">
          {alerts.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500 bg-gray-50 rounded-lg">
              ✅ All water containers and bottle stock levels are currently within safe operational capacity.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {alerts.map((item: any) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center text-xs"
                >
                  <div>
                    <div className="font-bold text-gray-900">{item.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Current: <strong className="text-gray-900">{item.stock}</strong> · Threshold (ROP): {item.effective_rop}
                    </div>
                  </div>
                  <span
                    className={`badge font-bold ${
                      item.status === 'Critical' ? 'badge-danger' : 'badge-warning'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RECENT TRANSACTIONS */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🧾 Recent Transactions</span>
          <Link to="/sales" className="btn btn-outline btn-sm">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table id="recentTable">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date / Time</th>
                <th>Cashier / Customer</th>
                <th>Total Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="recentBody">
              {salesHistory && salesHistory.length > 0 ? (
                salesHistory.slice(0, 8).map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-mono font-bold text-[#1565c0]">
                      #{s.order_number || String(s.id).padStart(4, '0')}
                    </td>
                    <td>{new Date(s.sold_at || s.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{s.cashier || s.customer || 'Walk-in'}</td>
                    <td className="font-bold text-gray-900">₱{Number(s.total).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${s.status === 'VOIDED' ? 'badge-danger' : 'badge-success'}`}>
                        {s.status === 'VOIDED' ? 'Voided' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    No transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
