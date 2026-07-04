import * as catalogService from '../services/catalogService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';

// POST /api/v1/catalog — multipart CSV upload, replaces the catalog.
export async function uploadCatalog(req, res, next) {
  try {
    ensureDb();
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'A CSV file is required in the "file" field.', {
        status: 400,
        details: [{ field: 'file', issue: 'missing' }],
      });
    }
    const result = await catalogService.replaceCatalog({
      buffer: req.file.buffer,
      filename: req.body.filenameOverride || req.file.originalname,
      uploadedBy: 'system',
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/catalog/status — active catalog metadata (or "none").
export async function getCatalogStatus(req, res, next) {
  try {
    ensureDb();
    const status = await catalogService.getStatus();
    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/catalog/products?query=&limit= — search the active catalog.
export async function getCatalogProducts(req, res, next) {
  try {
    ensureDb();

    const query = req.query.query;
    if (query === undefined || String(query).trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'A non-empty "query" parameter is required.', {
        status: 400,
        details: [{ field: 'query', issue: 'required' }],
      });
    }

    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new AppError('VALIDATION_ERROR', 'limit must be an integer between 1 and 50.', {
        status: 400,
        details: [{ field: 'limit', issue: '1..50' }],
      });
    }

    const status = await catalogService.getStatus();
    if (status.status !== 'active') {
      throw new AppError('NO_ACTIVE_CATALOG', 'No active product catalog. Upload a catalog first.', { status: 409 });
    }

    const result = await catalogService.searchProducts(String(query).trim(), limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
