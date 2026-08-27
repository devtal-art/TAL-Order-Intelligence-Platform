import * as productLookupService from '../services/productLookupService.js';
import { parseSearchTerms, MAX_SEARCH_TERMS } from '../utils/searchTerms.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';

// GET /api/v1/products/lookup?q=<'#'-separated search terms>
export async function lookupProducts(req, res, next) {
  try {
    ensureDb();
    const terms = parseSearchTerms(req.query.q);

    if (!terms.length) {
      throw new AppError('VALIDATION_ERROR', 'Provide at least one product name or item number to search.', {
        status: 400,
        details: [{ field: 'q', issue: 'required' }],
      });
    }
    if (terms.length > MAX_SEARCH_TERMS) {
      throw new AppError('VALIDATION_ERROR', `Too many search terms — at most ${MAX_SEARCH_TERMS} at once.`, {
        status: 400,
        details: [{ field: 'q', issue: `max ${MAX_SEARCH_TERMS} terms` }],
      });
    }

    const result = await productLookupService.lookupProducts(terms);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
