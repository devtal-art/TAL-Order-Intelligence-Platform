import { Router } from 'express';
import { getReport } from '../../controllers/customerReportController.js';

// Mounted at /api/v1/customer-reports (Phase 2 — new, independent router).
export const customerReportRouter = Router();

customerReportRouter.get('/:type', getReport);
