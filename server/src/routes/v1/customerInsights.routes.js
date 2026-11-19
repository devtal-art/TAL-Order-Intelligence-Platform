import { Router } from 'express';
import { getCustomerInsights } from '../../controllers/customerInsightsController.js';

// Mounted at /api/v1/customer-insights (Phase 2 — new, independent router;
// kept separate from customer.routes.js so that Phase 1 file stays untouched).
export const customerInsightsRouter = Router();

customerInsightsRouter.get('/:name', getCustomerInsights);
