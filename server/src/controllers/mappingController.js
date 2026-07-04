import * as mappingService from '../services/mappingService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// POST /api/v1/mappings
export async function createMapping(req, res, next) {
  try {
    ensureDb();
    const { emailProductName, websiteProductName, itemNo } = req.body || {};

    const details = [];
    if (isBlank(emailProductName)) details.push({ field: 'emailProductName', issue: 'required' });
    if (isBlank(websiteProductName)) details.push({ field: 'websiteProductName', issue: 'required' });
    if (isBlank(itemNo)) details.push({ field: 'itemNo', issue: 'required' });
    if (details.length) {
      throw new AppError('VALIDATION_ERROR', 'Missing required fields.', { status: 400, details });
    }

    // approvedBy comes from the authenticated principal, never the body (currently "system").
    const mapping = await mappingService.createMapping({
      emailProductName: String(emailProductName).trim(),
      websiteProductName: String(websiteProductName).trim(),
      itemNo: String(itemNo).trim(),
      approvedBy: 'system',
    });
    res.status(201).json(mapping);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/mappings
export async function listMappings(req, res, next) {
  try {
    ensureDb();
    const page = req.query.page !== undefined ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 50;

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new AppError('VALIDATION_ERROR', 'Invalid pagination parameters.', {
        status: 400,
        details: [{ field: 'page/pageSize', issue: 'page >= 1 and 1 <= pageSize <= 100' }],
      });
    }

    const { status } = req.query;
    if (status !== undefined && !['active', 'retired'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'status filter must be "active" or "retired".', {
        status: 400,
        details: [{ field: 'status', issue: 'invalid value' }],
      });
    }

    const result = await mappingService.listMappings({ query: req.query.query, page, pageSize, status });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/mappings/:id
export async function updateMapping(req, res, next) {
  try {
    ensureDb();
    const { websiteProductName, itemNo, status } = req.body || {};
    const mapping = await mappingService.updateMapping(req.params.id, { websiteProductName, itemNo, status });
    res.status(200).json(mapping);
  } catch (err) {
    next(err);
  }
}
