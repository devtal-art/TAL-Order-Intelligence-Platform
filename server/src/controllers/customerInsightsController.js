import * as customerInsightsService from '../services/customerInsightsService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/customer-insights/:name — generated, data-backed observations
// about one customer's ordering behaviour (read-only).
export async function getCustomerInsights(req, res, next) {
  try {
    ensureDb();
    const result = await customerInsightsService.getCustomerInsights(req.params.name);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
