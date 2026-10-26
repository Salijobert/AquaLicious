import React, { useState } from 'react';
import { useReports } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, subDays, differenceInDays } from 'date-fns';
import { BarChart3, TrendingUp, TrendingDown, Minus, Calendar, DollarSign, ShoppingBag, Award } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'Administrator';

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const daysDiff = Math.max(7, Math.min(365, differenceInDays(endDate, startDate) || 30));
  const { data: report, isLoading, error } = useReports(daysDiff);

  const series = report?.series || [];
  const trend = report?.trend || { sma: 0, slope: 0, percentage_slope: 0, label: 'Stable' };
  const summary = report?.summary || { total_revenue: 0, total_transactions: 0, total_profit: 0 };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reports & Analytics</h1>
          <p className="text-xs text-slate-500 font-semibold">Sales Performance, Gross Margins & Trend Modeling</p>
        </div>

        {/* Date Filter with React DatePicker */}
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm text-xs">
          <Calendar className="w-4 h-4 text-primary" />
          <DatePicker
            selected={startDate}
            onChange={(date: Date | null) => date && setStartDate(date)}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            maxDate={new Date()}
            dateFormat="yyyy-MM-dd"
            className="w-24 text-center border-b border-slate-300 focus:outline-none font-semibold text-slate-800"
          />
          <span className="text-slate-400">to</span>
          <DatePicker
            selected={endDate}
            onChange={(date: Date | null) => date && setEndDate(date)}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
            maxDate={new Date()}
            dateFormat="yyyy-MM-dd"
            className="w-24 text-center border-b border-slate-300 focus:outline-none font-semibold text-slate-800"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Total Revenue</span>
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            ₱{Number(summary.total_revenue).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Over {daysDiff} calendar days</div>
        </div>

        {isAdmin && (
          <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Gross Profit</span>
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="stat-value text-2xl font-black text-emerald-600">
              ₱{Number(report?.gross_profit || summary.total_profit || 0).toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">From historical cost snapshots</div>
          </div>
        )}

        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">Transactions</span>
            <ShoppingBag className="w-5 h-5 text-secondary" />
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            {summary.total_transactions}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Completed checkouts</div>
        </div>

        <div className="stat-card card bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="stat-label text-xs font-bold uppercase tracking-wider text-slate-500">7-Day Trend</span>
            {trend.label === 'Growing' && <TrendingUp className="w-5 h-5 text-emerald-500" />}
            {trend.label === 'Declining' && <TrendingDown className="w-5 h-5 text-rose-500" />}
            {trend.label === 'Stable' && <Minus className="w-5 h-5 text-slate-400" />}
          </div>
          <div className="stat-value text-2xl font-black text-slate-900">
            {trend.label}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Slope: {trend.percentage_slope}%</div>
        </div>
      </div>

      {/* Daily Sales Table (includes zero-sales days as per paper requirements) */}
      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Daily Revenue Series</h2>
            <p className="text-xs text-slate-500">Zero-sales days strictly preserved for unbiased modeling</p>
          </div>
          <span className="badge badge-secondary badge-outline text-xs font-bold">
            {series.length} data points
          </span>
        </div>

        <div className="overflow-x-auto max-h-[400px]">
          <table className="table table-sm text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700">
              <tr>
                <th>Date</th>
                <th>Revenue</th>
                {isAdmin && <th>Gross Profit</th>}
                <th>Transactions</th>
                <th>Units Sold</th>
              </tr>
            </thead>
            <tbody>
              {series.map((day: any, idx: number) => (
                <tr key={idx} className={day.revenue === 0 ? 'bg-slate-50/50' : 'hover'}>
                  <td className="font-mono text-slate-700">{day.date}</td>
                  <td className={`font-bold ${day.revenue > 0 ? 'text-primary' : 'text-slate-400'}`}>
                    ₱{Number(day.revenue).toFixed(2)}
                  </td>
                  {isAdmin && (
                    <td className="font-semibold text-emerald-700">
                      ₱{Number(day.profit || 0).toFixed(2)}
                    </td>
                  )}
                  <td>{day.transactions}</td>
                  <td>{day.units_sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
