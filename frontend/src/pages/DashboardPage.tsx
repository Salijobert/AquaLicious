import React, { useState } from 'react';
import { useReports, useInventory, useSales } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ArrowRight, PhilippinePeso } from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader.js';
import { PendingOrdersTile } from '../components/PendingOrdersTile.js';
import { formatPeso, formatSignedPeso } from '../utils/currency.js';

type Period = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export const DashboardPage: React.FC = () => {
  const { role } = useAuth();

  const formatIsoDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const todayStr = formatIsoDate(now);

  // Time period filter state (defaults to 'month' matching UI pill specification)
  const [period, setPeriod] = useState<Period>('month');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return formatIsoDate(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  // Dynamic days query for report analytics
  const queryDays = period === 'today' ? 7 : period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const { data: report, error: reportError } = useReports(queryDays);
  const { data: inventory } = useInventory();
  const { data: salesHistory } = useSales();

  const todayKpi = report?.today || { revenue: 0, transactions: 0, active_products: 0, low_stock: 0 };
  const trend = report?.trend || { sma: 0, slope: 0, percentage_slope: 0, label: 'Stable' };
  const alerts = inventory?.filter((p: any) => p.status === 'Critical' || p.status === 'Warning') || [];
  const series = report?.series || [];

  // Helper to determine if a date falls in current period
  const isDateInPeriod = (dateInput: string | Date | undefined) => {
    if (!dateInput) return false;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return false;
    const targetDateStr = formatIsoDate(d);

    if (period === 'today') {
      return targetDateStr === todayStr;
    }
    if (period === 'week') {
      const currentDay = now.getDay();
      const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
      const startOfWeekStr = formatIsoDate(startOfWeek);
      return targetDateStr >= startOfWeekStr && targetDateStr <= todayStr;
    }
    if (period === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfMonthStr = formatIsoDate(startOfMonth);
      return targetDateStr >= startOfMonthStr && targetDateStr <= todayStr;
    }
    if (period === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const startOfYearStr = formatIsoDate(startOfYear);
      return targetDateStr >= startOfYearStr && targetDateStr <= todayStr;
    }
    if (period === 'custom') {
      return targetDateStr >= customStart && targetDateStr <= customEnd;
    }
    return true; // 'all'
  };

  const currentMonthName = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  // Period labels & descriptions
  const periodLabels: Record<Period, { title: string; label: string; desc: string }> = {
    today: {
      title: "Today's Revenue",
      label: "Today's Sales",
      desc: `Today (${now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })})`
    },
    week: {
      title: "This Week's Revenue",
      label: "This Week's Sales",
      desc: "Current Week (Mon - Today)"
    },
    month: {
      title: "This Month's Revenue",
      label: "This Month's Sales",
      desc: currentMonthName
    },
    year: {
      title: "This Year's Revenue",
      label: "This Year's Sales",
      desc: `Annual (${now.getFullYear()})`
    },
    all: {
      title: "All-Time Revenue",
      label: "Total Sales",
      desc: "All transactions recorded"
    },
    custom: {
      title: "Custom Period Revenue",
      label: "Period Sales",
      desc: `${customStart} to ${customEnd}`
    }
  };

  // Filter sales history
  const filteredSales = (salesHistory || []).filter((s: any) => isDateInPeriod(s.sold_at || s.created_at));
  const completedSales = filteredSales.filter((s: any) => s.status !== 'VOIDED');

  const salesRevenue = completedSales.reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);
  const salesTransactions = completedSales.length;

  // Filter backend series
  const filteredSeries = series.filter((d: any) => isDateInPeriod(d.date));
  const seriesRevenue = filteredSeries.reduce((sum: number, d: any) => sum + (Number(d.revenue) || 0), 0);
  const seriesTransactions = filteredSeries.reduce((sum: number, d: any) => sum + (Number(d.transactions) || 0), 0);

  // Compute final period revenue & transactions
  const periodRevenue =
    period === 'today'
      ? (todayKpi.revenue || salesRevenue)
      : Math.max(salesRevenue, seriesRevenue);

  const periodTransactions =
    period === 'today'
      ? (todayKpi.transactions || salesTransactions)
      : Math.max(salesTransactions, seriesTransactions);

  const totalProductsCount = inventory?.length || todayKpi.active_products || 0;

  // Chart data calculation
  const chartDays =
    period === 'today' || period === 'week'
      ? series.slice(-7)
      : filteredSeries.length > 0 && filteredSeries.length <= 14
      ? filteredSeries
      : series.slice(-7);

  const maxDayRevenue = Math.max(...chartDays.map((d: any) => Number(d.revenue) || 0), 100);
  const displaySales = (filteredSales.length > 0 ? filteredSales : salesHistory || []).slice(0, 8);

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {reportError ? (reportError as any).message : ''}
      </div>

      {/* STANDARDIZED ADMIN PAGE HEADER WITH PERIOD FILTER BAR */}
      <AdminPageHeader
        title="Dashboard"
        subtitle={
          <span>
            Executive KPIs, sales trends, and real-time operational status for{' '}
            <span className="font-bold text-[#0b3d91]">{periodLabels[period].desc}</span>.
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3 min-w-0 max-w-full">
            <div className="bg-white/95 rounded-2xl sm:rounded-full border border-[#bbdefb] p-1 shadow-xs flex flex-wrap items-center gap-1 max-w-full min-w-0">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'year', label: 'This Year' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom' }
              ].map((tab) => {
                const isActive = period === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPeriod(tab.id as Period)}
                    className={`px-4 py-1.5 sm:py-2 text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer rounded-full ${
                      isActive
                        ? 'bg-[#1565c0] hover:bg-[#0b3d91] text-white font-bold shadow-xs'
                        : 'text-[#0b3d91] hover:text-[#0b3d91] hover:bg-[#e3f2fd] font-semibold'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Pickers */}
            {period === 'custom' && (
              <div className="flex items-center gap-2 bg-white/95 px-4 py-1.5 rounded-full border border-[#bbdefb] shadow-xs text-xs animate-in fade-in">
                <span className="text-[#1565c0] font-bold">From:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-[#bbdefb] rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:border-[#1565c0] focus:ring-1 focus:ring-[#1565c0]"
                />
                <span className="text-[#1565c0] font-bold">To:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-[#bbdefb] rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:border-[#1565c0] focus:ring-1 focus:ring-[#1565c0]"
                />
              </div>
            )}
          </div>
        }
      />

      {/* STAT CARDS */}
      <div className="stat-grid" id="statGrid">
        <div className="stat-card">
          <div className="stat-label">{periodLabels[period].title}</div>
          <div className="stat-value">{formatPeso(periodRevenue)}</div>
          <div className="stat-sub">{periodTransactions} transaction{periodTransactions !== 1 ? 's' : ''} in period</div>
          <div className="stat-icon icon-blue">
            <PhilippinePeso className="w-5 h-5" />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">{periodLabels[period].label}</div>
          <div className="stat-value">{periodTransactions}</div>
          <div className="stat-sub">{periodLabels[period].desc}</div>
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
          <div className="stat-label">
            {period === 'today' ? "Today's Avg Order" : period === 'month' ? 'Total Revenue (This Month)' : 'Avg Order Value'}
          </div>
          <div className="stat-value">
            {period === 'month'
              ? formatPeso(periodRevenue)
              : formatPeso(periodTransactions > 0 ? periodRevenue / periodTransactions : 0)}
          </div>
          <div className="stat-sub">
            {period === 'month' ? currentMonthName : 'Per completed order'}
          </div>
          <div className="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ADMIN PENDING ORDERS TILE */}
      <PendingOrdersTile />

      {/* CHARTS ROW (Sales Breakdown + Forecast & Health) */}
      <div className="grid-2">
        {/* Sales Bar Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Sales – {period === 'week' || period === 'today' ? 'Last 7 Days' : periodLabels[period].label}</span>
          </div>
          <div className="card-body">
            <div className="chart-area" id="salesChart">
              {chartDays.length > 0 ? (
                chartDays.map((d: any) => {
                  const rev = Number(d.revenue) || 0;
                  const pct = Math.max(8, Math.round((rev / maxDayRevenue) * 100));
                  const dateObj = new Date(d.date + 'T00:00:00');
                  const dayLabel = dateObj.toLocaleDateString('en-PH', { weekday: 'short' });
                  const dateLabel = dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center min-w-0">
                      <span className="text-[10px] font-semibold text-gray-700 mb-1">
                        {formatPeso(rev)}
                      </span>
                      <div className="h-36 w-full flex items-end">
                        <div
                          className="bar w-full"
                          title={`${dateLabel}: ${formatPeso(rev)}`}
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
                  Recording transactions will populate sales graph.
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
                  {formatPeso(trend.sma)} <span className="text-xs font-medium text-gray-500">/ day</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Daily Trend Slope</div>
                <div className="text-xl font-black text-gray-900 mt-1">
                  {formatSignedPeso(trend.slope)} <span className="text-xs font-medium text-gray-500">/ day</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-gray-600 leading-relaxed">
              <strong>Operating Insight:</strong> Trend evaluation uses a least-squares linear regression over the last 7 completed business days. Active register sales are isolated to prevent premature downward bias.
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
          <span className="card-title">
            🧾 Recent Transactions {period !== 'all' ? `(${periodLabels[period].label})` : ''}
          </span>
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
              {displaySales.length > 0 ? (
                displaySales.map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-mono font-bold text-[#1565c0]">
                      #{s.order_number || String(s.id).padStart(4, '0')}
                    </td>
                    <td>{new Date(s.sold_at || s.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{s.cashier || s.customer || 'Walk-in'}</td>
                    <td className="font-bold text-gray-900">{formatPeso(s.total)}</td>
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
                    No transactions recorded for {periodLabels[period].desc}.
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
