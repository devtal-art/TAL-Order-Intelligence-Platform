import { apiClient } from './apiClient.js';

// Approved Mapping API (v1). The UI only creates mappings (the Approve
// action); the server's list/update endpoints exist for admin use via the API.
export const mappingService = {
  // payload: { emailProductName, websiteProductName, itemNo }
  create: (payload) => apiClient.post('/v1/mappings', payload),

  // GET /v1/mappings?query=&pageSize= (V3.1 — Manual Order Creation). Searches
  // email name, website name, AND item number in one call — used for the
  // manual product row smart lookup (Cases 1-3). Read-only; existing `create`
  // above is unaffected.
  search: (query, pageSize = 8) =>
    apiClient.get(`/v1/mappings?query=${encodeURIComponent(query)}&pageSize=${encodeURIComponent(pageSize)}`),
};
