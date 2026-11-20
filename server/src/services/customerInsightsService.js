import { Order } from '../models/order.model.js';
import { AppError } from '../utils/AppError.js';
import { parseFlexibleDate, daysBetween } from '../utils/dateUtil.js';

// ────────────────────────────────────────────────
//  CUSTOMER INSIGHTS SERVICE (Phase 2 — new, independent, read-only)
//
//  Generates plain-language, data-backed observations about one customer's
//  ordering behaviour. Every insight is computed directly from that
//  customer's own Orders — nothing is inferred from data the schema doesn't
//  carry. In particular, there is no "mostly purchases frozen foods"-style
//  category insight: neither Product nor Order carries a category field, so
//  guessing one from keywords would risk a wrong, business-facing claim.
// ────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

// Platform-wide average lifetime revenue per customer — the yardstick the
// "high value" insight is measured against. One bounded aggregation,
// computed on demand rather than cached: acceptable at the platform's
// current scale. If Orders grows very large this is the first candidate to
// memoize (e.g. recompute once per hour) rather than per profile view.
async function getPlatformAverageRevenue() {
  const [stats] = await Order.aggregate([
    { $match: { customer_name: { $nin: ['', null] } } },
    { $group: { _id: '$customer_name', revenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } } } },
    { $group: { _id: null, avgRevenue: { $avg: '$revenue' } } },
  ]);
  return stats?.avgRevenue || 0;
}

export async function getCustomerInsights(customerName) {
  const name = String(customerName || '').trim();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 'Customer name is required.', { status: 400 });
  }

  // Every date here is the order's ORDER DATE (the date written on the
  // order, read with the shared parseFlexibleDate) — not upload time. Orders
  // with no readable Order Date are left out of the date-based insights.
  const allOrders = await Order.find(
    { customer_name: name },
    { portal_order_ref: 1, order_date: 1, 'parsed_data.financials.total': 1 }
  ).lean();

  if (!allOrders.length) {
    throw new AppError('NOT_FOUND', `No customer found with name "${name}".`, { status: 404 });
  }

  // Ascending by Order Date — the cadence/trend math below reads more
  // naturally walking forward through time.
  const orders = allOrders
    .map((o) => ({ ...o, _od: parseFlexibleDate(o.order_date) }))
    .filter((o) => o._od)
    .sort((a, b) => a._od - b._od);

  const insights = [];
  const dates = orders.map((o) => o._od);

  // 1. Order cadence — average days between consecutive orders.
  let avgCadenceDays = null;
  if (dates.length >= 2) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / 86400000);
    avgCadenceDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    insights.push({ type: 'cadence', text: `Customer orders approximately every ${round1(avgCadenceDays)} days.` });
  }

  // 2. Dormancy — days since the most recent order, relative to their usual cadence.
  const lastOrderDate = dates[dates.length - 1];
  // Whole calendar days, the same count the Analytics Dashboard's at-risk list uses.
  const daysSinceLastOrder = lastOrderDate ? daysBetween(new Date(), lastOrderDate) : null;
  const dormancyThreshold = avgCadenceDays ? Math.max(30, avgCadenceDays * 1.5) : 30;
  if (daysSinceLastOrder !== null && daysSinceLastOrder > dormancyThreshold) {
    insights.push({
      type: 'dormancy',
      text: `Customer has not ordered in ${daysSinceLastOrder} days${
        avgCadenceDays ? ` — longer than their usual ~${round1(avgCadenceDays)}-day cycle` : ''
      }.`,
    });
  }

  // 3. Spending trend — the last two calendar months with any activity.
  const monthlyMap = new Map();
  for (const o of orders) {
    const d = o._od;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = Number(o.parsed_data?.financials?.total) || 0;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + total);
  }
  const months = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (months.length >= 2) {
    const prevRevenue = months[months.length - 2][1];
    const currRevenue = months[months.length - 1][1];
    if (prevRevenue > 0) {
      const pct = Math.round(((currRevenue - prevRevenue) / prevRevenue) * 100);
      if (Math.abs(pct) >= 5) {
        insights.push({
          type: 'trend',
          text: `Customer spending ${pct >= 0 ? 'increased' : 'decreased'} ${Math.abs(pct)}% month-over-month.`,
        });
      }
    }
  }

  // 4. High-value flag — lifetime revenue well above the platform average.
  // Not date-based — every order counts, dated or not.
  const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.parsed_data?.financials?.total) || 0), 0);
  const avgPlatformRevenue = await getPlatformAverageRevenue();
  if (avgPlatformRevenue > 0 && totalRevenue >= avgPlatformRevenue * 1.5) {
    insights.push({
      type: 'high_value',
      text: `Customer is a high-value account — lifetime revenue is ${round1(totalRevenue / avgPlatformRevenue)}x the platform average.`,
    });
  }

  // 5. Preferred order day-of-week — only surfaced once there's enough
  // history for a genuine pattern (3+ orders, and one day is ≥40% of them).
  if (dates.length >= 3) {
    const counts = new Array(7).fill(0);
    for (const d of dates) counts[d.getDay()]++;
    const max = Math.max(...counts);
    if (max / dates.length >= 0.4) {
      insights.push({ type: 'day_preference', text: `Customer usually places orders on ${DAY_NAMES[counts.indexOf(max)]}s.` });
    }
  }

  // 6. Repeat customer.
  if (allOrders.length > 1) {
    insights.push({ type: 'repeat_customer', text: `Repeat customer with ${allOrders.length} orders placed to date.` });
  }

  return { customerName: name, insights };
}
