import { apiClient } from './apiClient.js';

// Product lookup API (V5.1) — the Search page's "Search Products" feature.
//   GET /api/v1/products/lookup?q=<'#'-separated search terms>
export const productLookupService = {
  lookup: (rawQuery) => apiClient.get(`/v1/products/lookup?q=${encodeURIComponent(rawQuery)}`),
};
