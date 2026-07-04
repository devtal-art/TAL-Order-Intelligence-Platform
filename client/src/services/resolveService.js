import { apiClient } from './apiClient.js';

// Product Resolution API (v1). Mirrors the frozen contract:
//   POST /api/v1/resolve
//
// `products` is the contract array: [{ lineId, name, package?, qty? }].
// Returns: { catalogVersion, results: [{ lineId, emailProductName, status,
//            confidence, reason, source, match, candidates }] }
export const resolveService = {
  resolve: (products) => apiClient.post('/v1/resolve', { products }),
};
