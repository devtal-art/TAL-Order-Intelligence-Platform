import { Order } from '../models/order.model.js';
import { litInvoiceTotal, osPendingQty } from './customerIntelligenceService.js';
import { parseFlexibleDate, daysBetween } from '../utils/dateUtil.js';
import { ORDER_CHANNELS } from './orderService.js';
import { CUSTOMER_GROUPS, groupForCustomer } from '../config/customerGroups.js';

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

// Every month key from `start` to `end` (Dates, inclusive), oldest→newest,
// keeping only the LAST `cap` months.
function monthsBetween(start, end, cap = 24) {
  const months = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= stop) {
    months.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months.slice(-cap);
}

// ── Dashboard filters ───────────────────────────────────────────────────
// Turns the Analytics Dashboard's filters into a Mongo $match on Orders.
//   dateFrom / dateTo — 'YYYY-MM-DD', inclusive, matched against each order's
//                       Order Date (order_date, free text → parseFlexibleDate,
//                       the same parser every other Order Date filter uses).
//                       An order whose Order Date can't be read is excluded
//                       while a date filter is active.
//   channel           — one of ORDER_CHANNELS (order_channel).
//   group             — a customer group id from config/customerGroups.js;
//                       membership by customer name via groupForCustomer().
// Unknown channel/group values are ignored rather than matching nothing.
// Returns { match } (all filters) and { matchNoDate } (channel + group only —
// used by the at-risk list, which is always measured up to today).
async function buildOrderMatch({ dateFrom, dateTo, channel, group } = {}) {
  const base = {};
  if (channel && ORDER_CHANNELS.includes(channel)) base.order_channel = channel;

  if (group && CUSTOMER_GROUPS.some((g) => g.id === group)) {
    const names = await Order.distinct('customer_name', base);
    base.customer_name = { $in: names.filter((n) => groupForCustomer(n)?.id === group) };
  }

  const from = dateFrom ? parseFlexibleDate(String(dateFrom)) : null;
  const to = dateTo ? parseFlexibleDate(String(dateTo)) : null;
  if (!from && !to) return { match: base, matchNoDate: base, from: null, to: null };

  const candidates = await Order.find(base, { _id: 1, order_date: 1 }).lean();
  const ids = candidates
    .filter((o) => {
      const d = parseFlexibleDate(o.order_date);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    })
    .map((o) => o._id);
  return { match: { ...base, _id: { $in: ids } }, matchNoDate: base, from, to };
}

// Options for the dashboard's filter dropdowns — sent with the overview so
// the client never hard-codes channel names or group ids. `years` = every
// year that appears in a readable Order Date (newest first), for the Year
// filter.
async function filterOptions() {
  const rawDates = await Order.distinct('order_date');
  const years = new Set();
  for (const s of rawDates) {
    const d = parseFlexibleDate(s);
    if (d) years.add(d.getFullYear());
  }
  return {
    channels: [...ORDER_CHANNELS],
    groups: CUSTOMER_GROUPS.map((g) => ({ id: g.id, name: g.name })),
    years: [...years].sort((a, b) => b - a),
  };
}

// Top products platform-wide — the one query that unwinds line items across
// ALL orders. Bounded by total line-item count; at large scale this is the
// first candidate to cache/memoize (e.g. refresh hourly) rather than
// recompute on every dashboard/report load. Exported standalone (not just
// inlined in getAnalyticsOverview) so callers that need ONLY this — like the
// Top Products report — don't pay for the rest of the overview aggregation.
// `match` (optional) narrows the orders first — the dashboard filters.
export async function getTopProductsPlatform(limit = 10, match = {}) {
  const limitN = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 50);
  const rows = await Order.aggregate([
    { $match: match },
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

// Invoiced / Lost / Pending value cards (platform-wide, all orders — same
// scope as the Ordered Value card so Fulfilment Rate compares like with like).
//   Invoiced Value — sum of the "Lit Invoice amount" of every lit_invoice
//                    order (litInvoiceTotal: the server mirror of
//                    OrderFinancials.jsx's Updated card).
//   Lost Value     — cancelled orders: Σ qty × unit_price over ALL their
//                    product lines; other orders: Σ qty × |unit_price| over
//                    'Not Found' lines (same convention OrderFinancials uses).
//   Pending Value  — non-cancelled orders: Σ pendingQty × |unit_price| over
//                    'OS' lines (pendingQty clamped 0…qty; full qty if blank —
//                    the same rule OrderFinancials deducts with).
// A cancelled order is counted once, wholly in Lost Value — its own Not
// Found / OS lines are not added again anywhere.
async function getValueBreakdown(match = {}) {
  const orders = await Order.find(
    match,
    {
      _id: 0,
      order_source: 1,
      order_status: 1,
      lit_invoice: 1,
      order_date: 1,
      'parsed_data.financials.total': 1,
      'parsed_data.financials.sub_total': 1,
      'parsed_data.financials.transportation_charges': 1,
      'parsed_data.financials.discount': 1,
      'parsed_data.financials.discounts.amount': 1,
      'parsed_data.line_items.qty': 1,
      'parsed_data.line_items.unit_price': 1,
      'resolution_data.results.lineId': 1,
      'resolution_data.results.source': 1,
      product_comments: 1,
      product_fulfillment: 1,
    }
  ).lean();

  let invoiced = 0;
  let lost = 0;
  let pending = 0;
  // Trend buckets keyed by the ORDER DATE month ('YYYY-MM', from the date
  // written on the order via parseFlexibleDate). Orders whose Order Date is
  // blank/unreadable can't be placed in a month and are left out of the
  // trend (they still count in every total above).
  const byMonth = new Map(); // key -> { ordered, invoiced, orders }
  const bucket = (key) => {
    let b = byMonth.get(key);
    if (!b) byMonth.set(key, (b = { ordered: 0, invoiced: 0, orders: 0 }));
    return b;
  };

  for (const o of orders) {
    const orderDate = parseFlexibleDate(o.order_date);
    const b = orderDate ? bucket(monthKey(orderDate)) : null;
    if (b) {
      b.ordered += Number(o.parsed_data?.financials?.total) || 0;
      b.orders += 1;
    }

    if (o.lit_invoice === true) {
      const amount = litInvoiceTotal(o);
      invoiced += amount;
      if (b) b.invoiced += amount;
    }

    const lineItems = Array.isArray(o.parsed_data?.line_items) ? o.parsed_data.line_items : [];

    if (o.order_status === 'Order Cancelled') {
      for (const item of lineItems) {
        lost += (Number(item?.qty) || 0) * (Number(item?.unit_price) || 0);
      }
      continue;
    }

    const results = Array.isArray(o.resolution_data?.results) ? o.resolution_data.results : [];
    const comments = o.product_comments || {};
    const fulfillment = o.product_fulfillment || {};
    for (const r of results) {
      const comment = comments[r.lineId];
      if (comment !== 'Not Found' && comment !== 'OS') continue;
      const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
      const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && lineItems[lineIndex]) || null;
      if (!item) continue;
      const qty = Number(item.qty) || 0;
      const unitPrice = Math.abs(Number(item.unit_price) || 0);
      if (comment === 'Not Found') lost += qty * unitPrice;
      else pending += osPendingQty(fulfillment[r.lineId]?.pendingQty, qty) * unitPrice;
    }
  }

  return { invoiced, lost, pending, byMonth };
}

// Platform-wide overview: the Analytics Dashboard's stat cards + chart data.
// `trendMonths` bounds the revenue/orders/growth trend series length.
// `filters` = { dateFrom, dateTo, channel, group } (see buildOrderMatch);
// with no filters the result is exactly the unfiltered platform-wide view.
export async function getAnalyticsOverview({ trendMonths = 12, filters = {} } = {}) {
  const { match, matchNoDate, from, to } = await buildOrderMatch(filters);

  // ── Customer-level pass (one aggregation, grouped by customer_name) ──
  // Bounded by distinct-customer count, not order count — cheap even as
  // Orders grows, since it scales with customers, not line items.
  const customerGroupStage = {
    $group: {
      _id: '$customer_name',
      orderCount: { $sum: 1 },
      totalRevenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
      orderDates: { $push: '$order_date' }, // Order Date as written on the order (at-risk list)
    },
  };
  const customerRows = await Order.aggregate([
    { $match: { $and: [{ customer_name: { $nin: ['', null] } }, match] } },
    customerGroupStage,
  ]);

  // The at-risk list measures silence up to TODAY, so the date range doesn't
  // apply to it (a past "To" date would make every customer look at risk);
  // channel and group still do. Without a date filter it's the same rows.
  const atRiskRows =
    from || to
      ? await Order.aggregate([
          { $match: { $and: [{ customer_name: { $nin: ['', null] } }, matchNoDate] } },
          customerGroupStage,
        ])
      : customerRows;

  const totalCustomers = customerRows.length;

  // At-risk customers — the SAME dormancy rule the Customer Profile's
  // insights use (customerInsightsService.getCustomerInsights): at risk when
  // days since last order > max(30, 1.5 × usual gap between orders), or > 30
  // when there is no usual gap (one order, or all orders on the same day).
  // Usual gap = (last − first) / (dated orders − 1), which equals the
  // profile's average of consecutive gaps. Longest-silent first.
  //
  // Dates come from each order's own Order Date (order_date, the date written
  // on the order) — NOT upload/processing time — parsed with the shared
  // parseFlexibleDate() the rest of the app uses for Order Date. Orders whose
  // Order Date is blank/unreadable are skipped; a customer with no readable
  // Order Date at all can't be dated and is left out of this list.
  const today = new Date();
  const atRiskCustomers = atRiskRows
    .map((c) => {
      const dates = (c.orderDates || []).map((s) => parseFlexibleDate(s)).filter(Boolean);
      if (!dates.length) return null;
      const times = dates.map((d) => d.getTime());
      const last = new Date(Math.max(...times));
      const first = new Date(Math.min(...times));
      const daysSinceLastOrder = daysBetween(today, last);
      const avgCadenceDays = dates.length >= 2 ? daysBetween(last, first) / (dates.length - 1) : null;
      const threshold = avgCadenceDays ? Math.max(30, avgCadenceDays * 1.5) : 30;
      if (daysSinceLastOrder <= threshold) return null;
      return { customerName: c._id, daysSinceLastOrder, lifetimeValue: round2(c.totalRevenue) };
    })
    .filter(Boolean)
    // Full list (the dashboard card shows 5 and pages the rest in with
    // "View more") — bounded by customer count, so small.
    .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder || b.lifetimeValue - a.lifetimeValue);
  const repeatCustomers = customerRows.filter((c) => c.orderCount > 1).length;

  const topCustomers = [...customerRows]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10)
    .map((c) => ({ customerName: c._id, totalRevenue: round2(c.totalRevenue), orderCount: c.orderCount }));

  const revenueDistribution = REVENUE_BUCKETS.map((b) => ({
    label: b.label,
    count: customerRows.filter((c) => c.totalRevenue >= b.min && c.totalRevenue < b.max).length,
  }));

  // New customers per month, keyed on each customer's EARLIEST Order Date
  // (the date written on the order). A customer with no readable Order Date
  // can't be placed in a month and is left out of this chart.
  const growthMap = new Map();
  for (const c of customerRows) {
    let first = null;
    for (const s of c.orderDates || []) {
      const d = parseFlexibleDate(s);
      if (d && (!first || d < first)) first = d;
    }
    if (!first) continue;
    const key = monthKey(first);
    growthMap.set(key, (growthMap.get(key) || 0) + 1);
  }

  // ── Order-level pass — platform totals + monthly revenue/order trend ──
  const [orderStats] = await Order.aggregate([
    { $match: match },
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
      },
    },
  ]);

  const totals = orderStats?.totals?.[0] || { totalOrders: 0, totalRevenue: 0, avgProductsPerOrder: 0 };

  // Trend window: the trailing `trendMonths` by default; with a date filter
  // it follows the range instead (From's month → To's month, or → this
  // month when there's no To; 12 months back from To when there's no From),
  // capped at 24 months. All three trend series (ordered/invoiced revenue,
  // monthly orders, customer growth) are bucketed by ORDER DATE month — the
  // same date the filters use, so a filtered range and its trend agree. The
  // "This Month" tiles read the same Order Date buckets.
  let months = trailingMonths(trendMonths);
  if (from || to) {
    const end = to || new Date();
    const start = from || new Date(end.getFullYear(), end.getMonth() - 11, 1);
    months = monthsBetween(start, end, 24);
  }
  const values = await getValueBreakdown(match);
  const revenueTrend = months.map((m) => ({
    month: m,
    revenue: round2(values.byMonth.get(m)?.ordered || 0),
    invoiced: round2(values.byMonth.get(m)?.invoiced || 0),
  }));
  const monthlyOrders = months.map((m) => ({ month: m, orders: values.byMonth.get(m)?.orders || 0 }));
  const customerGrowth = months.map((m) => ({ month: m, newCustomers: growthMap.get(m) || 0 }));

  const currentMonthKey = monthKey(new Date());
  // "This Month" = orders whose Order Date falls in the current month.
  const monthlyRevenueThisMonth = round2(values.byMonth.get(currentMonthKey)?.ordered || 0);
  const ordersThisMonth = values.byMonth.get(currentMonthKey)?.orders || 0;

  const topProducts = await getTopProductsPlatform(10, match);

  return {
    currentMonth: currentMonthKey,
    filterOptions: await filterOptions(),
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
      invoicedValue: round2(values.invoiced),
      lostValue: round2(values.lost),
      pendingValue: round2(values.pending),
      fulfilmentRatePct: totals.totalRevenue ? round2((values.invoiced / totals.totalRevenue) * 100) : 0,
    },
    charts: { revenueTrend, customerGrowth, monthlyOrders, topCustomers, topProducts, revenueDistribution },
    atRiskCustomers,
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
        orderDates: { $push: '$order_date' },
      },
    },
  ]);

  // "Most frequent" = shortest average gap between ORDER DATES:
  // (latest − earliest) ÷ (dated orders − 1). Needs 2+ orders with a
  // readable Order Date spanning at least a day; otherwise sorts last.
  const withFrequency = rows.map((c) => {
    const dates = (c.orderDates || []).map((s) => parseFlexibleDate(s)).filter(Boolean);
    const times = dates.map((d) => d.getTime());
    const spanDays = dates.length >= 2 ? daysBetween(new Date(Math.max(...times)), new Date(Math.min(...times))) : 0;
    const avgDaysBetweenOrders = dates.length > 1 && spanDays > 0 ? spanDays / (dates.length - 1) : Infinity;
    const { orderDates, ...rest } = c;
    return { ...rest, avgDaysBetweenOrders };
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
