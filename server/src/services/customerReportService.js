import { AppError } from '../utils/AppError.js';
import { parseFlexibleDate } from '../utils/dateUtil.js';
import * as customerService from './customerIntelligenceService.js';
import * as customerAnalyticsService from './customerAnalyticsService.js';

// ────────────────────────────────────────────────
//  CUSTOMER REPORT SERVICE (Phase 2 — new, independent, read-only)
//
//  A single generic report generator rather than six near-identical
//  functions: every report type returns the same { title, columns, rows,
//  summary } shape, so one frontend table + one CSV/Excel/print exporter
//  covers all of them. Purely a re-shaping layer over the existing
//  customerService / customerAnalyticsService read paths — no new queries
//  beyond what those already expose.
// ────────────────────────────────────────────────

const REPORT_TYPES = ['customer', 'financial', 'purchase', 'revenue', 'top-products', 'top-customers'];

// Date range (inclusive) against each row's ORDER DATE — the date written on
// the order, read with the shared parseFlexibleDate(). A row whose Order Date
// is blank/unreadable is left out while a range is set.
function filterByDateRange(rows, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return rows;
  const from = dateFrom ? parseFlexibleDate(String(dateFrom)) : null;
  const to = dateTo ? parseFlexibleDate(String(dateTo)) : null;
  if (!from && !to) return rows;
  return rows.filter((r) => {
    const d = parseFlexibleDate(r.orderDate);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// `type` — see REPORT_TYPES. `customerName` is required for 'customer' and
// 'purchase'; optional (scopes to one customer instead of the whole
// platform) for 'financial'. `dateFrom`/`dateTo` narrow 'purchase' rows.
// `limit` bounds 'revenue'/'top-customers' row counts.
export async function getReportData({ type, customerName, dateFrom, dateTo, limit } = {}) {
  if (!REPORT_TYPES.includes(type)) {
    throw new AppError('VALIDATION_ERROR', `type must be one of: ${REPORT_TYPES.join(', ')}.`, { status: 400 });
  }

  if (type === 'customer') {
    if (!customerName) {
      throw new AppError('VALIDATION_ERROR', 'customerName is required for the customer report.', { status: 400 });
    }
    const profile = await customerService.getCustomerProfile(customerName);
    return {
      title: `Customer Report — ${profile.customerName}`,
      columns: [
        { key: 'portalOrderRef', label: 'Order #' },
        { key: 'orderDate', label: 'Order Date' },
        { key: 'processedBy', label: 'Processed By' },
        { key: 'resolutionStatus', label: 'Status' },
        { key: 'totalProducts', label: 'Products' },
        { key: 'total', label: 'Total' },
      ],
      rows: profile.purchaseHistory,
      summary: profile.financials,
    };
  }

  if (type === 'financial') {
    if (customerName) {
      const profile = await customerService.getCustomerProfile(customerName);
      return {
        title: `Financial Report — ${profile.customerName}`,
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue' },
        ],
        rows: profile.monthlyRevenue,
        summary: profile.financials,
      };
    }
    const overview = await customerAnalyticsService.getAnalyticsOverview({ trendMonths: 12 });
    return {
      title: 'Financial Report — All Customers',
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'revenue', label: 'Revenue' },
      ],
      rows: overview.charts.revenueTrend,
      summary: overview.cards,
    };
  }

  if (type === 'purchase') {
    if (!customerName) {
      throw new AppError('VALIDATION_ERROR', 'customerName is required for the purchase report.', { status: 400 });
    }
    const profile = await customerService.getCustomerProfile(customerName);
    return {
      title: `Purchase Report — ${profile.customerName}`,
      columns: [
        { key: 'portalOrderRef', label: 'Order #' },
        { key: 'orderDate', label: 'Order Date' },
        { key: 'totalProducts', label: 'Products' },
        { key: 'total', label: 'Total' },
        { key: 'resolutionStatus', label: 'Status' },
      ],
      rows: filterByDateRange(profile.purchaseHistory, dateFrom, dateTo),
      summary: null,
    };
  }

  if (type === 'revenue') {
    const result = await customerService.listCustomers({
      sort: 'revenue',
      limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    });
    return {
      title: 'Revenue Report — By Customer',
      columns: [
        { key: 'customerName', label: 'Customer' },
        { key: 'orderCount', label: 'Orders' },
        { key: 'totalRevenue', label: 'Total Revenue' },
        { key: 'avgOrderValue', label: 'Avg Order Value' },
      ],
      rows: result.data,
      summary: null,
    };
  }

  if (type === 'top-products') {
    const rows = await customerAnalyticsService.getTopProductsPlatform(Math.min(Math.max(Number(limit) || 20, 1), 50));
    return {
      title: 'Top Products Report',
      columns: [
        { key: 'productName', label: 'Product' },
        { key: 'totalQty', label: 'Total Qty' },
        { key: 'totalRevenue', label: 'Total Revenue' },
        { key: 'orderCount', label: 'Orders' },
      ],
      rows,
      summary: null,
    };
  }

  // type === 'top-customers'
  const rows = await customerAnalyticsService.getCustomerRankings({
    metric: 'revenue',
    limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
  });
  return {
    title: 'Top Customers Report',
    columns: [
      { key: 'customerName', label: 'Customer' },
      { key: 'orderCount', label: 'Orders' },
      { key: 'totalRevenue', label: 'Total Revenue' },
      { key: 'highestOrderValue', label: 'Highest Order' },
    ],
    rows,
    summary: null,
  };
}
