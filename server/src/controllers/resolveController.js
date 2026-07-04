import * as resolveService from '../services/resolveService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';

const MAX_PRODUCTS = 200;
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// POST /api/v1/resolve
export async function resolve(req, res, next) {
  try {
    ensureDb();
    const { products } = req.body || {};

    if (!Array.isArray(products) || products.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'A non-empty "products" array is required.', {
        status: 400,
        details: [{ field: 'products', issue: 'must be a non-empty array' }],
      });
    }
    if (products.length > MAX_PRODUCTS) {
      throw new AppError('PAYLOAD_TOO_LARGE', `Too many products (max ${MAX_PRODUCTS} per request).`, { status: 413 });
    }

    const seen = new Set();
    const details = [];
    products.forEach((p, index) => {
      if (!p || typeof p !== 'object') {
        details.push({ index, issue: 'each product must be an object' });
        return;
      }
      if (isBlank(p.name)) details.push({ index, field: 'name', issue: 'required' });
      if (isBlank(p.lineId)) {
        details.push({ index, field: 'lineId', issue: 'required' });
      } else if (seen.has(p.lineId)) {
        details.push({ index, field: 'lineId', issue: 'must be unique within the request' });
      } else {
        seen.add(p.lineId);
      }
    });
    if (details.length) {
      throw new AppError('VALIDATION_ERROR', 'Invalid products payload.', { status: 400, details });
    }

    const result = await resolveService.resolveProducts(products);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
