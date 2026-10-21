import { apiClient } from './apiClient.js';

// Order API (v1.2 — new, additive). Persists one order per uploaded HTML,
// keyed by Portal Order Ref No.
//   POST  /api/v1/orders                  — create/update (upsert) one order
//   GET   /api/v1/orders                  — list orders (summary)
//   GET   /api/v1/orders/:ref             — full order detail
//   PATCH /api/v1/orders/:ref             — update resolution snapshot + status
//   PATCH /api/v1/orders/:ref/comments    — set per-product comments
export const orderService = {
  // order: { portalOrderRef, filename, customerName, orderDate, totalProducts, parsedData, resolutionData, orderSource? }
  // orderSource is optional ('HTML' | 'MANUAL', V3.1) — omitted by the upload flow, defaults server-side to 'HTML'.
  save: (order) => apiClient.post('/v1/orders', order),

  updateResolution: (portalOrderRef, resolutionData) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}`, { resolutionData }),

  list: (query) => apiClient.get(`/v1/orders${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  listByCompany: (company) => apiClient.get(`/v1/orders?company=${encodeURIComponent(company)}`),
  autocompleteCompanies: (query) => apiClient.get(`/v1/orders/companies/autocomplete?query=${encodeURIComponent(query)}`),

  // Manual order number auto-generation (V5) — 'KS-YYYYMMDD-N'. nextManualRef
  // is a preview only, for display while Create Manual Order is open;
  // createManualOrder is the real, race-safe save (no portalOrderRef sent —
  // the server assigns it).
  nextManualRef: () => apiClient.get('/v1/orders/manual/next-ref'),
  // order: { customerName, orderDate, totalProducts, parsedData, resolutionData }
  createManualOrder: (order) => apiClient.post('/v1/orders/manual', order),

  // Latest N saved orders (V2.3) — the Search page's "Recent Processed Orders".
  recent: (limit = 5) => apiClient.get(`/v1/orders?limit=${encodeURIComponent(limit)}`),

  get: (portalOrderRef) => apiClient.get(`/v1/orders/${encodeURIComponent(portalOrderRef)}`),

  // comments: { [lineId]: 'Released' | 'OS' | 'N/A' | null }
  setComments: (portalOrderRef, comments) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/comments`, { comments }),

  // fulfillment: { [lineId]: { pendingQty?, status? } | null } (V1.4)
  setFulfillment: (portalOrderRef, fulfillment) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/fulfillment`, { fulfillment }),

  // notes: { [lineId]: string | null } — free-text Additional Comments (V1.7)
  setNotes: (portalOrderRef, notes) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/notes`, { notes }),

  // processedBy: one of processors() below, or '' to clear (V1.9)
  setProcessedBy: (portalOrderRef, processedBy) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/processed-by`, { processedBy }),

  // The current "Processed By" allowlist (Admin Portal — additive), dynamic:
  // reflects newly created/renamed/deleted employees immediately with no
  // hardcoded list to keep in sync. Resolves to { names: string[] }.
  processors: () => apiClient.get('/v1/orders/processors'),

  // orderStatus: one of ORDER_STATUSES; orderComment: optional free text (V3.2)
  setOrderStatus: (portalOrderRef, { orderStatus, orderComment }) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/status`, { orderStatus, orderComment }),

  // deliveryDate: free-text date string, '' to clear (V4.2) — always editable.
  setDeliveryDate: (portalOrderRef, deliveryDate) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/delivery-date`, { deliveryDate }),

  // discountProvided: boolean — toggled only from the discount "View All" pages.
  setDiscountProvided: (portalOrderRef, discountProvided) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/discount-provided`, { discountProvided }),

  // litInvoice: boolean — relabels/recolours the Updated totals card.
  setLitInvoice: (portalOrderRef, litInvoice) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/lit-invoice`, { litInvoice }),

  // Dashboard summary (V2.2, read-only): per delivery status / comment bucket,
  // the total count plus the latest `limit` orders. Derived live server-side
  // from the Orders collection — never from a duplicated summary store.
  dashboard: (limit = 5) => apiClient.get(`/v1/orders/dashboard?limit=${encodeURIComponent(limit)}`),

  // Full filtered bucket list for "View All" (V2.2, paginated).
  // type: 'status' | 'comment' | 'orderStatus' | 'orderComment'; value: bucket
  // value (e.g. 'delivered', 'N/A', or 'has' for orderComment).
  // from/to (optional, 'YYYY-MM-DD'): restrict to orders whose Order Date
  // falls in that range.
  dashboardOrders: ({ type, value, page = 1, limit = 25, sortBy, sortDir, from, to }) => {
    let qs = `type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    if (sortBy) qs += `&sortBy=${encodeURIComponent(sortBy)}&sortDir=${encodeURIComponent(sortDir || 'asc')}`;
    if (from) qs += `&from=${encodeURIComponent(from)}`;
    if (to) qs += `&to=${encodeURIComponent(to)}`;
    return apiClient.get(`/v1/orders/dashboard/orders?${qs}`);
  },

  // Full multi-sheet dashboard workbook download (V4.8, read-only).
  exportDashboard: () => apiClient.download('/v1/orders/dashboard/export', 'Dashboard Export.xlsx'),

  // OS Pending by Item (Dashboard "Item" card — new, additive): one row per
  // item number with an 'OS' line, its total pending quantity, and the
  // individual orders/customers contributing to it. Resolves to
  // { data: [{ itemNo, productName, totalPendingQty, orders: [{ portalOrderRef, customerName, pendingQty }] }] }.
  // from/to (optional, 'YYYY-MM-DD'): restrict to orders whose Order Date
  // falls in that range.
  osPendingByItem: ({ from, to } = {}) => {
    let qs = '';
    if (from) qs += `${qs ? '&' : '?'}from=${encodeURIComponent(from)}`;
    if (to) qs += `${qs ? '&' : '?'}to=${encodeURIComponent(to)}`;
    return apiClient.get(`/v1/orders/dashboard/os-pending${qs}`);
  },

  // Customer delivery days (new, additive) — weekday names, keyed by customer
  // name. get resolves to { exists, deliveryDays }; exists=false → none
  // assigned yet. set replaces the customer's days (at least one required).
  getCustomerDeliveryDays: (name) =>
    apiClient.get(`/v1/orders/customers/delivery-days?name=${encodeURIComponent(name)}`),
  setCustomerDeliveryDays: (name, deliveryDays) =>
    apiClient.put('/v1/orders/customers/delivery-days', { name, deliveryDays }),

  // Order Activity Log — one order's history, paginated, newest first.
  logs: (portalOrderRef, { page = 1, limit = 25 } = {}) =>
    apiClient.get(`/v1/orders/${encodeURIComponent(portalOrderRef)}/logs?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`),

  // Cross-order Recent Activity feed — powers the Dashboard widget.
  recentActivity: ({ page = 1, limit = 10, date, portalOrderRef, actor, sortBy, sortDir } = {}) => {
    let qs = `page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    if (date) qs += `&date=${encodeURIComponent(date)}`;
    if (portalOrderRef) qs += `&portalOrderRef=${encodeURIComponent(portalOrderRef)}`;
    if (actor) qs += `&actor=${encodeURIComponent(actor)}`;
    if (sortBy) qs += `&sortBy=${encodeURIComponent(sortBy)}`;
    if (sortDir) qs += `&sortDir=${encodeURIComponent(sortDir)}`;
    return apiClient.get(`/v1/orders/logs/recent?${qs}`);
  },
};
