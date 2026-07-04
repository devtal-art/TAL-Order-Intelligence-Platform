import { apiClient } from './apiClient.js';

// Approved Mapping API (v1). Mirrors the frozen contract:
//   POST  /api/v1/mappings
//   GET   /api/v1/mappings
//   PATCH /api/v1/mappings/:id
export const mappingService = {
  // payload: { emailProductName, websiteProductName, itemNo }
  create: (payload) => apiClient.post('/v1/mappings', payload),

  // params: { query, page, pageSize, status }
  list: ({ query, page, pageSize, status } = {}) => {
    const p = new URLSearchParams();
    if (query) p.set('query', query);
    if (page) p.set('page', page);
    if (pageSize) p.set('pageSize', pageSize);
    if (status) p.set('status', status);
    const qs = p.toString();
    return apiClient.get(`/v1/mappings${qs ? `?${qs}` : ''}`);
  },

  // patch: any of { websiteProductName, itemNo, status }
  update: (id, patch) => apiClient.patch(`/v1/mappings/${id}`, patch),
};
