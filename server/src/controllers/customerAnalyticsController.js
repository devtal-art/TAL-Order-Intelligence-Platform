import * as customerAnalyticsService from '../services/customerAnalyticsService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/customer-analytics/overview?months= — platform-wide Analytics
// Dashboard cards + chart series (read-only).
export async function getOverview(req, res, next) {
  try {
    ensureDb();
    const months = Math.min(Math.max(Math.floor(Number(req.query.months)) || 12, 3), 24);
    const result = await customerAnalyticsService.getAnalyticsOverview({ trendMonths: months });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer-analytics/rankings?metric=&limit= — customer
// leaderboards (read-only).
export async function getRankings(req, res, next) {
  try {
    ensureDb();
    const { metric, limit } = req.query;
    const result = await customerAnalyticsService.getCustomerRankings({ metric, limit });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
