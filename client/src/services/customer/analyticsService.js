import { apiClient } from '../apiClient.js';

// Customer Analytics API (Phase 2, new, independent). Read-only — derived
// server-side from the Orders collection.
//   GET /api/v1/customer-analytics/overview   — dashboard cards + chart series
//   GET /api/v1/customer-analytics/rankings   — customer leaderboards
export const analyticsService = {
  // filters (all optional): { dateFrom, dateTo ('YYYY-MM-DD', by Order Date), channel, group }
  overview: (months = 12, filters = {}) => {
    const params = new URLSearchParams({ months: String(months) });
    for (const k of ['dateFrom', 'dateTo', 'channel', 'group']) {
      if (filters[k]) params.set(k, filters[k]);
    }
    return apiClient.get(`/v1/customer-analytics/overview?${params.toString()}`);
  },

  // metric: 'revenue' | 'orders' | 'orderValue' | 'quantity' | 'frequency'
  rankings: ({ metric = 'revenue', limit = 10 } = {}) =>
    apiClient.get(`/v1/customer-analytics/rankings?metric=${encodeURIComponent(metric)}&limit=${encodeURIComponent(limit)}`),
};
