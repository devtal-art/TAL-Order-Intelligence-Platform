import { apiClient } from '../apiClient.js';

// Customer Analytics API (Phase 2, new, independent). Read-only — derived
// server-side from the Orders collection.
//   GET /api/v1/customer-analytics/overview   — dashboard cards + chart series
//   GET /api/v1/customer-analytics/rankings   — customer leaderboards
export const analyticsService = {
  overview: (months = 12) => apiClient.get(`/v1/customer-analytics/overview?months=${encodeURIComponent(months)}`),

  // metric: 'revenue' | 'orders' | 'orderValue' | 'quantity' | 'frequency'
  rankings: ({ metric = 'revenue', limit = 10 } = {}) =>
    apiClient.get(`/v1/customer-analytics/rankings?metric=${encodeURIComponent(metric)}&limit=${encodeURIComponent(limit)}`),
};
