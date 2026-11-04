import React, { useState, useRef } from 'react';
import { useReports, useSales, useProducts } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subDays, differenceInDays } from 'date-fns';
import { Printer, TrendingUp, TrendingDown, Minus, Calendar, DollarSign, Award, ShoppingBag } from 'lucide-react';
import { VirtualTableBody, RevenueSkeletonRow } from '../components/virtual/index.js';
import { AdminPageHeader } from '../components/AdminPageHeader.js';

export const ReportsPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const seriesContainerRef = useRef<HTMLDivElement>(null);

  const daysDiff = Math.max(7, Math.min(365, differenceInDays(endDate, startDate) || 30));
  const { data: report, error } = useReports(daysDiff);
  const { data: sales } = useSales();
  const { data: products } = useProducts();

  const series = report?.series || [];
  const trend = report?.trend || { sma: 0, slope: 0, percentage_slope: 0, label: 'Stable' };
  const summary = report?.summary || { total_revenue: 0, total_transactions: 0, total_profit: 0 };

  const handlePrint = () => {
    window.print();
  };

  const isHealthy = trend.label === 'Growing';
  const isDeclining = trend.label === 'Declining';

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <AdminPageHeader
        title="Reports & Analytics"
        subtitle="Revenue metrics, transaction trends, and historical business summaries."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-300 shadow-xs text-xs">
              <Calendar className="w-4 h-4 text-[#1565c0]" />
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => date && setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={new Date()}
                dateFormat="yyyy-MM-dd"
                className="w-24 text-center border-b border-gray-300 focus:outline-none font-semibold text-gray-800"
              />
              <span className="text-gray-400">to</span>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => date && setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                maxDate={new Date()}
                dateFormat="yyyy-MM-dd"
                className="w-24 text-center border-b border-gray-300 focus:outline-none font-semibold text-gray-800"
              />
            </div>

            <button onClick={handlePrint} className="btn btn-outline btn-sm gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
          </div>
        }
      />

      {/* KEY METRICS */}
      <div className="stat-grid" id="metricRow">
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">₱{Number(summary.total_revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="stat-sub">Over {daysDiff} calendar days</div>
          <div className="stat-icon icon-blue">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {isAdmin && (
          <div className="stat-card">
            <div className="stat-label">Gross Profit</div>
            <div className="stat-value text-emerald-600">
              ₱{Number(report?.gross_profit || summary.total_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-sub">From historical cost snapshots</div>
            <div className="stat-icon icon-green">
              <Award className="w-5 h-5" />
            </div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{summary.total_transactions}</div>
          <div className="stat-sub">Recorded sales orders</div>
          <div className="stat-icon icon-orange">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">7-Day Trend</div>
          <div className="stat-value">{trend.label}</div>
          <div className="stat-sub">Slope: {trend.percentage_slope > 0 ? '+' : ''}{trend.percentage_slope}% / day</div>
          <div className="stat-icon icon-blue">
            {isHealthy ? (
              <TrendingUp className="w-5 h-5" />
            ) : isDeclining ? (
              <TrendingDown className="w-5 h-5" />
            ) : (
              <Minus className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* HEALTH + FORECAST VERDICT */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">🩺 Is the Business Doing Well?</span>
          </div>
          <div className="card-body space-y-4">
            <div
              className={`p-4 rounded-xl flex items-center gap-3 ${
                isHealthy
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : isDeclining
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <div className="text-2xl font-black">
                {isHealthy ? '✅' : isDeclining ? '⚠️' : '📊'}
              </div>
              <div>
                <div className="font-bold text-sm">
                  {isHealthy
                    ? 'Sales are expanding positively'
                    : isDeclining
                    ? 'Recent volume is softening'
                    : 'Revenue pace is steady and balanced'}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  7-Day moving average is ₱{Number(trend.sma).toFixed(2)}/day with a {trend.percentage_slope}% gradient.
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs divide-y divide-gray-100">
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Gross Margin:</span>
                <strong className="text-gray-900">
                  {summary.total_revenue > 0
                    ? `${(((report?.gross_profit || summary.total_profit || 0) / summary.total_revenue) * 100).toFixed(1)}%`
                    : '0.0%'}
                </strong>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Average Daily Revenue:</span>
                <strong className="text-gray-900">
                  ₱{(summary.total_revenue / Math.max(1, series.length)).toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Daily Trend Rate:</span>
                <strong className="text-[#1565c0]">
                  {trend.slope >= 0 ? '+' : ''}₱{Number(trend.slope).toFixed(2)} / day
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">📅 Peak Sales Days</span>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {series
                .slice()
                .sort((a: any, b: any) => Number(b.revenue) - Number(a.revenue))
                .slice(0, 4)
                .map((day: any) => (
                  <div key={day.date} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                    <div>
                      <div className="font-bold text-gray-900">
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-[11px] text-gray-500">{day.transactions} transaction(s) completed</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-[#1565c0] text-sm">₱{Number(day.revenue).toFixed(2)}</div>
                      <div className="text-[10px] text-emerald-600 font-semibold">₱{Number(day.profit || 0).toFixed(2)} profit</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* FULL SALES REPORT TABLE */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Full Daily Revenue Series</span>
          <span className="text-xs text-gray-500">Zero-sales days strictly preserved ({series.length} days)</span>
        </div>
        <div ref={seriesContainerRef} className="overflow-x-auto overflow-y-auto max-h-[400px] rounded-xl border border-gray-100">
          <table>
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-xs">
              <tr>
                <th>Date</th>
                <th>Transactions</th>
                <th>Revenue (₱)</th>
                <th>Gross Margin (₱)</th>
                <th>Average / Sale</th>
              </tr>
            </thead>
            <VirtualTableBody
              items={series}
              containerRef={seriesContainerRef}
              rowHeight={48}
              colSpan={5}
              renderRow={(row: any) => {
                const rev = Number(row.revenue);
                const prof = Number(row.profit || 0);
                const tx = Number(row.transactions);
                return (
                  <tr key={row.date}>
                    <td className="font-semibold text-gray-800">{row.date}</td>
                    <td>{tx}</td>
                    <td className="font-bold text-gray-900">₱{rev.toFixed(2)}</td>
                    <td className="text-emerald-600 font-semibold">₱{prof.toFixed(2)}</td>
                    <td className="text-gray-600">₱{tx > 0 ? (rev / tx).toFixed(2) : '0.00'}</td>
                  </tr>
                );
              }}
              renderSkeletonRow={(index) => <RevenueSkeletonRow key={index} />}
              emptyRow={
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    No sales recorded in the selected period.
                  </td>
                </tr>
              }
            />
          </table>
        </div>
      </div>
    </div>
  );
};
