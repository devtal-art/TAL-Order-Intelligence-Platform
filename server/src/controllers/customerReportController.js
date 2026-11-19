import * as customerReportService from '../services/customerReportService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/customer-reports/:type — generate one report's dataset
// (read-only). ?customerName= &dateFrom= &dateTo= &limit= depending on type.
export async function getReport(req, res, next) {
  try {
    ensureDb();
    const { customerName, dateFrom, dateTo, limit } = req.query;
    const result = await customerReportService.getReportData({
      type: req.params.type,
      customerName,
      dateFrom,
      dateTo,
      limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
