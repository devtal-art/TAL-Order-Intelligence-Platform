import { Order } from '../models/order.model.js';

// ────────────────────────────────────────────────
//  CUSTOMER ANALYTICS SERVICE (Phase 2 — new, independent, read-only)
//
//  Platform-wide analytics (the Analytics Dashboard's cards/charts) and
//  customer rankings (leaderboards). Both are computed live from Orders —
//  no denormalized summary collections, same principle as Phase 1's
//  listCustomers/getCustomerProfile and the pre-existing operational
//  Dashboard (orderService.getDashboardSummary).
// ────────────────────────────────────────────────

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const REVENUE_BUCKETS = [
  { label: '£0 - £500', min: 0, max: 500 },
  { label: '£500 - £1,000', min: 500, max: 1000 },
  { label: '£1,000 - £2,500', min: 1000, max: 2500 },
  { label: '£2,500 - £5,000', min: 2500, max: 5000 },
  { label: '£5,000 - £10,000', min: 5000, max: 10000 },
  { label: '£10,000+', min: 10000, max: Infinity },
];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Trailing N calendar months (oldest→newest), each seeded so a month with
// zero activity still appears in a trend series instead of leaving a gap.
function trailingMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

// Top products platform-wide — the one query that unwinds line items across
// ALL orders. Bounded by total line-item count; at large scale this is the
// first candidate to cache/memoize (e.g. refresh hourly) rather than
// recompute on every dashboard/report load. Exported standalone (not just
// inlined in getAnalyticsOverview) so callers that need ONLY this — like the
// Top Products report — don't pay for the rest of the overview aggregation.
export async function getTopProductsPlatform(limit = 10) {
  const limitN = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 50);
  const rows = await Order.aggregate([
    { $unwind: '$parsed_data.line_items' },
    {
      $group: {
        _id: '$parsed_data.line_items.description',
        totalQty: { $sum: { $ifNull: ['$parsed_data.line_items.qty', 0] } },
        totalRevenue: { $sum: { $ifNull: ['$parsed_data.line_items.total', 0] } },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalQty: -1 } },
    { $limit: limitN },
  ]);
  return rows.map((p) => ({
    productName: p._id || 'Unknown',
    totalQty: p.totalQty,
    totalRevenue: round2(p.totalRevenue),
    orderCount: p.orderCount,
  }));
}

// Platform-wide overview: the Analytics Dashboard's stat cards + chart data.
// `trendMonths` bounds the revenue/orders/growth trend series length.
export async function getAnalyticsOverview({ trendMonths = 12 } = {}) {
  // ── Customer-level pass (one aggregation, grouped by customer_name) ──
  // Bounded by distinct-customer count, not order count — cheap even as
  // Orders grows, since it scales with customers, not line items.
  const customerRows = await Order.aggregate([
    { $match: { customer_name: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$customer_name',
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
        firstOrderDate: { $min: '$upload_timestamp' },
      },
    },
  ]);

  const totalCustomers = customerRows.length;
  const repeatCustomers = customerRows.filter((c) => c.orderCount > 1).length;

  const topCustomers = [...customerRows]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10)
    .map((c) => ({ customerName: c._id, totalRevenue: round2(c.totalRevenue), orderCount: c.orderCount }));

  const revenueDistribution = REVENUE_BUCKETS.map((b) => ({
    label: b.label,
    count: customerRows.filter((c) => c.totalRevenue >= b.min && c.totalRevenue < b.max).length,
  }));

  // New customers per month, keyed on each customer's FIRST order date.
  const growthMap = new Map();
  for (const c of customerRows) {
    const d = c.firstOrderDate instanceof Date ? c.firstOrderDate : new Date(c.firstOrderDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d);
    growthMap.set(key, (growthMap.get(key) || 0) + 1);
  }

  // ── Order-level pass — platform totals + monthly revenue/order trend ──
  const [orderStats] = await Order.aggregate([
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
              avgProductsPerOrder: { $avg: { $ifNull: ['$total_products', 0] } },
            },
          },
        ],
        monthly: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$upload_timestamp' } },
              revenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
              orders: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const totals = orderStats?.totals?.[0] || { totalOrders: 0, totalRevenue: 0, avgProductsPerOrder: 0 };
  const monthlyByKey = new Map((orderStats?.monthly || []).map((m) => [m._id, m]));

  const months = trailingMonths(trendMonths);
  const revenueTrend = months.map((m) => ({ month: m, revenue: round2(monthlyByKey.get(m)?.revenue || 0) }));
  const monthlyOrders = months.map((m) => ({ month: m, orders: monthlyByKey.get(m)?.orders || 0 }));
  const customerGrowth = months.map((m) => ({ month: m, newCustomers: growthMap.get(m) || 0 }));

  const currentMonthKey = monthKey(new Date());
  const monthlyRevenueThisMonth = round2(monthlyByKey.get(currentMonthKey)?.revenue || 0);
  const ordersThisMonth = monthlyByKey.get(currentMonthKey)?.orders || 0;

  const topProducts = await getTopProductsPlatform(10);

  return {
    cards: {
      totalCustomers,
      totalRevenue: round2(totals.totalRevenue),
      repeatCustomers,
      repeatCustomerRatePct: totalCustomers ? round2((repeatCustomers / totalCustomers) * 100) : 0,
      averageRevenue: totalCustomers ? round2(totals.totalRevenue / totalCustomers) : 0,
      averageOrderValue: totals.totalOrders ? round2(totals.totalRevenue / totals.totalOrders) : 0,
      averageProductsPerOrder: round2(totals.avgProductsPerOrder || 0),
      monthlyRevenue: monthlyRevenueThisMonth,
      ordersThisMonth,
    },
    charts: { revenueTrend, customerGrowth, monthlyOrders, topCustomers, topProducts, revenueDistribution },
  };
}

// Customer rankings/leaderboards. `metric`:
//   'revenue' (default, highest spending) | 'orders' (most active) |
//   'orderValue' (highest single order) | 'quantity' (largest quantity
//   purchased) | 'frequency' (most frequent — shortest average days between
//   orders; single-order customers sort last, not first).
export async function getCustomerRankings({ metric = 'revenue', limit = 10 } = {}) {
  const limitN = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 50);

  const rows = await Order.aggregate([
    { $match: { customer_name: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$customer_name',
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
        highestOrderValue: { $max: { $ifNull: ['$parsed_data.financials.total', 0] } },
        totalQuantity: {
          $sum: { $sum: { $map: { input: { $ifNull: ['$parsed_data.line_items', []] }, as: 'li', in: { $ifNull: ['$$li.qty', 0] } } } },
        },
        firstOrderDate: { $min: '$upload_timestamp' },
        lastOrderDate: { $max: '$upload_timestamp' },
      },
    },
  ]);

  const withFrequency = rows.map((c) => {
    const spanDays = (new Date(c.lastOrderDate) - new Date(c.firstOrderDate)) / 86400000;
    const avgDaysBetweenOrders = c.orderCount > 1 && spanDays > 0 ? spanDays / (c.orderCount - 1) : Infinity;
    return { ...c, avgDaysBetweenOrders };
  });

  const sorters = {
    revenue: (a, b) => b.totalRevenue - a.totalRevenue,
    orders: (a, b) => b.orderCount - a.orderCount,
    orderValue: (a, b) => b.highestOrderValue - a.highestOrderValue,
    quantity: (a, b) => b.totalQuantity - a.totalQuantity,
    frequency: (a, b) => a.avgDaysBetweenOrders - b.avgDaysBetweenOrders,
  };
  const sorter = sorters[metric] || sorters.revenue;

  return withFrequency
    .sort(sorter)
    .slice(0, limitN)
    .map((c) => ({
      customerName: c._id,
      orderCount: c.orderCount,
      totalRevenue: round2(c.totalRevenue),
      highestOrderValue: round2(c.highestOrderValue),
      totalQuantity: c.totalQuantity,
      avgDaysBetweenOrders: Number.isFinite(c.avgDaysBetweenOrders) ? round2(c.avgDaysBetweenOrders) : null,
    }));
}
