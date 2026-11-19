import { apiClient } from '../apiClient.js';

// Plain pass-through filter params (sent only when non-empty).
const PASS_THROUGH = [
  // Legacy order-level filters — still supported by the API.
  'orderNumber', 'product', 'itemNo', 'dateFrom', 'dateTo', 'status',
  // Column filters (Customer List table).
  'postCode', 'ordersMin', 'ordersMax', 'revenueMin', 'revenueMax',
  'invoiced', 'invoicedMin', 'invoicedMax', 'avgMin', 'avgMax',
  // Export: every matching row, no paging.
  'all',
  // Sort direction ('asc' | 'desc').
  'dir',
  // Customers page: group members come back in `groups` (accordions).
  'grouped',
];

// Local midnight `offsetDays` from today — the same calendar-day convention
// CustomerList's "N days ago" column uses, so the filter and the column agree.
function localMidnight(offsetDays) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
}

const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// Customer Intelligence API (new, independent module). Read-only — derived
// server-side from the Orders collection.
//   GET /api/v1/customers        — list customers (search + paginate + sort + filters)
//   GET /api/v1/customers/:name  — full customer profile
export const customerService = {
  // { query?, page?, limit?, sort?, ...filters } — sort: 'revenue' | 'orders' | 'recent' | 'name' | 'quantity'
  // `lastDaysMin` / `lastDaysMax` ("Last Ordered N days ago" range) are
  // converted here into lastOrderedBefore / lastOrderedSince ISO bounds.
  list: ({ query, page = 1, limit = 25, sort = 'revenue', lastDaysMin, lastDaysMax, ...filters } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    params.set('page', page);
    params.set('limit', limit);
    params.set('sort', sort);
    for (const key of PASS_THROUGH) {
      if (isSet(filters[key])) params.set(key, String(filters[key]).trim());
    }
    // daysAgo >= min  ⇔  last order before local midnight of (today − min + 1)
    if (isSet(lastDaysMin) && Number.isFinite(Number(lastDaysMin))) {
      params.set('lastOrderedBefore', localMidnight(1 - Math.max(0, Math.floor(Number(lastDaysMin)))).toISOString());
    }
    // daysAgo <= max  ⇔  last order on/after local midnight of (today − max)
    if (isSet(lastDaysMax) && Number.isFinite(Number(lastDaysMax))) {
      params.set('lastOrderedSince', localMidnight(-Math.max(0, Math.floor(Number(lastDaysMax)))).toISOString());
    }
    return apiClient.get(`/v1/customers?${params.toString()}`);
  },

  profile: (customerName) => apiClient.get(`/v1/customers/${encodeURIComponent(customerName)}`),
};
