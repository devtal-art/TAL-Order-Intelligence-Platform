import { apiClient } from './apiClient.js';

// Approved Mapping API (v1). The UI only creates mappings (the Approve
// action); the server's list/update endpoints exist for admin use via the API.
export const mappingService = {
  // payload: { emailProductName, websiteProductName, itemNo }
  create: (payload) => apiClient.post('/v1/mappings', payload),
};
