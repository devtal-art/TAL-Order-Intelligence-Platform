import { Router } from 'express';
import { getOverview, getRankings } from '../../controllers/customerAnalyticsController.js';

// Mounted at /api/v1/customer-analytics (Phase 2 — new, independent router).
export const customerAnalyticsRouter = Router();

customerAnalyticsRouter.get('/overview', getOverview);
customerAnalyticsRouter.get('/rankings', getRankings);
