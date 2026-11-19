import { apiClient } from '../apiClient.js';

// Customer Insights API (Phase 2, new, independent). Read-only.
//   GET /api/v1/customer-insights/:name — generated, data-backed observations
export const insightsService = {
  get: (customerName) => apiClient.get(`/v1/customer-insights/${encodeURIComponent(customerName)}`),
};
