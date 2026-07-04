import { apiClient } from './apiClient.js';

// Product Catalog API (v1). Mirrors the frozen contract:
//   GET  /api/v1/catalog/status
//   POST /api/v1/catalog        (multipart, field name "file")
export const catalogService = {
  getStatus: () => apiClient.get('/v1/catalog/status'),
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload('/v1/catalog', formData);
  },
  // GET /api/v1/catalog/products?query=&limit=
  searchProducts: (query, limit = 10) => {
    const p = new URLSearchParams();
    p.set('query', query);
    if (limit) p.set('limit', String(limit));
    return apiClient.get(`/v1/catalog/products?${p.toString()}`);
  },
};
