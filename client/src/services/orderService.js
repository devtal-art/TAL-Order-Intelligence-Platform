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

  // processedBy: one of PROCESSED_BY_USERS, or '' to clear (V1.9)
  setProcessedBy: (portalOrderRef, processedBy) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/processed-by`, { processedBy }),

<<<<<<< HEAD
=======
  // orderStatus: one of ORDER_STATUSES; orderComment: optional free text (V3.2)
  setOrderStatus: (portalOrderRef, { orderStatus, orderComment }) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/status`, { orderStatus, orderComment }),

  // deliveryDate: free-text date string, '' to clear (V4.2) — always editable.
  setDeliveryDate: (portalOrderRef, deliveryDate) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}/delivery-date`, { deliveryDate }),

>>>>>>> 87432db (New Dashboard)
  // Dashboard summary (V2.2, read-only): per delivery status / comment bucket,
  // the total count plus the latest `limit` orders. Derived live server-side
  // from the Orders collection — never from a duplicated summary store.
  dashboard: (limit = 5) => apiClient.get(`/v1/orders/dashboard?limit=${encodeURIComponent(limit)}`),

  // Full filtered bucket list for "View All" (V2.2, paginated).
<<<<<<< HEAD
  // type: 'status' | 'comment'; value: bucket value (e.g. 'delivered', 'N/A').
  dashboardOrders: ({ type, value, page = 1, limit = 25 }) =>
    apiClient.get(
      `/v1/orders/dashboard/orders?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`
    ),
=======
  // type: 'status' | 'comment' | 'orderStatus' | 'orderComment'; value: bucket
  // value (e.g. 'delivered', 'N/A', or 'has' for orderComment).
  dashboardOrders: ({ type, value, page = 1, limit = 25, sortBy, sortDir }) => {
    let qs = `type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    if (sortBy) qs += `&sortBy=${encodeURIComponent(sortBy)}&sortDir=${encodeURIComponent(sortDir || 'asc')}`;
    return apiClient.get(`/v1/orders/dashboard/orders?${qs}`);
  },

  // Full multi-sheet dashboard workbook download (V4.8, read-only).
  exportDashboard: () => apiClient.download('/v1/orders/dashboard/export', 'Dashboard Export.xlsx'),
>>>>>>> 87432db (New Dashboard)
};
