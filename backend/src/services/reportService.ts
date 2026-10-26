import { prisma } from '../config/index.js';
import { OrderStatus, Role } from '@prisma/client';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';

export class ReportService {
  static async getAnalytics(role: Role, days = 30) {
    const isStaff = role === Role.STAFF;
    const isAdmin = role === Role.ADMIN;

    if (!isAdmin && !isStaff) {
      throw { status: 403, message: 'Analytics access forbidden for customers' };
    }

    const clampedDays = Math.max(7, Math.min(365, Number(days) || 30));
    const now = new Date();
    const todayStart = startOfDay(now);
    const startDate = startOfDay(subDays(now, clampedDays));

    // Fetch active completed sales orders
    const orders = await prisma.salesOrder.findMany({
      where: {
        orderStatus: OrderStatus.COMPLETED,
        createdAt: { gte: startDate }
      },
      include: {
        items: true
      }
    });

    // 1. Calculate Today's KPIs
    const todayOrders = orders.filter(o => o.createdAt >= todayStart);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const todayTransactions = todayOrders.length;

    // 2. Build Daily Series including Zero-Sales Days
    const seriesMap = new Map<string, { date: string; revenue: number; transactions: number; units: number; profit: number }>();
    for (let i = clampedDays - 1; i >= 0; i--) {
      const d = format(subDays(now, i), 'yyyy-MM-dd');
      seriesMap.set(d, { date: d, revenue: 0, transactions: 0, units: 0, profit: 0 });
    }

    orders.forEach(o => {
      const d = format(o.createdAt, 'yyyy-MM-dd');
      const entry = seriesMap.get(d);
      if (entry) {
        entry.revenue += Number(o.totalAmount);
        entry.transactions += 1;
        o.items.forEach(item => {
          entry.units += item.quantity;
          const cost = Number(item.unitCostSnapshot);
          const price = Number(item.unitPrice);
          entry.profit += (price - cost) * item.quantity;
        });
      }
    });

    const series = Array.from(seriesMap.values());

    // 3. 7-Day SMA & Linear Regression (Last 7 COMPLETED days, excluding today)
    const sevenCompletedDays: number[] = [];
    for (let i = 7; i >= 1; i--) {
      const d = format(subDays(now, i), 'yyyy-MM-dd');
      const val = seriesMap.get(d)?.revenue || 0;
      sevenCompletedDays.push(val);
    }

    const sum7 = sevenCompletedDays.reduce((a, b) => a + b, 0);
    const sma7 = Math.round((sum7 / 7) * 100) / 100;

    // Linear regression on the 7 completed days (x = 1 to 7)
    const n = 7;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      const y = sevenCompletedDays[i]!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const meanY = sumY / n;

    let percentageSlope = 0;
    let trendLabel = 'Stable';

    if (meanY > 0) {
      percentageSlope = (slope / meanY) * 100;
      if (percentageSlope >= 5) {
        trendLabel = 'Growing';
      } else if (percentageSlope <= -5) {
        trendLabel = 'Declining';
      }
    }

    // 4. Products summary
    const activeProductCount = await prisma.product.count({ where: { active: true } });
    const lowStockCount = await prisma.product.count({
      where: {
        active: true,
        stock: { lte: prisma.product.fields.reorderPt }
      }
    });

    const totalRevenue = series.reduce((sum, s) => sum + s.revenue, 0);
    const totalTransactions = series.reduce((sum, s) => sum + s.transactions, 0);
    const totalProfit = series.reduce((sum, s) => sum + s.profit, 0);

    const result: any = {
      today: {
        revenue: Number(todayRevenue.toFixed(2)),
        transactions: todayTransactions,
        active_products: activeProductCount,
        low_stock: lowStockCount
      },
      series: series.map(s => ({
        date: s.date,
        revenue: Number(s.revenue.toFixed(2)),
        transactions: s.transactions,
        units_sold: s.units
      })),
      trend: {
        sma: sma7,
        slope: Number(slope.toFixed(2)),
        percentage_slope: Number(percentageSlope.toFixed(2)),
        label: trendLabel
      },
      summary: {
        total_revenue: Number(totalRevenue.toFixed(2)),
        total_transactions: totalTransactions,
        days: clampedDays
      }
    };

    // Gross profit is only exposed to Administrator
    if (isAdmin) {
      result.gross_profit = Number(totalProfit.toFixed(2));
      result.summary.total_profit = Number(totalProfit.toFixed(2));
      result.series = series.map(s => ({
        date: s.date,
        revenue: Number(s.revenue.toFixed(2)),
        profit: Number(s.profit.toFixed(2)),
        transactions: s.transactions,
        units_sold: s.units
      }));
    }

    return result;
  }
}
