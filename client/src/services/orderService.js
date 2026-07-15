import { apiClient } from './apiClient.js';

// Order API (v1.2 — new, additive). Persists one order per uploaded HTML,
// keyed by Portal Order Ref No.
//   POST  /api/v1/orders                  — create/update (upsert) one order
//   GET   /api/v1/orders                  — list orders (summary)
//   GET   /api/v1/orders/:ref             — full order detail
//   PATCH /api/v1/orders/:ref             — update resolution snapshot + status
//   PATCH /api/v1/orders/:ref/comments    — set per-product comments
export const orderService = {
  // order: { portalOrderRef, filename, customerName, orderDate, totalProducts, parsedData, resolutionData }
  save: (order) => apiClient.post('/v1/orders', order),

  updateResolution: (portalOrderRef, resolutionData) =>
    apiClient.patch(`/v1/orders/${encodeURIComponent(portalOrderRef)}`, { resolutionData }),

  list: (query) => apiClient.get(`/v1/orders${query ? `?query=${encodeURIComponent(query)}` : ''}`),

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
};
