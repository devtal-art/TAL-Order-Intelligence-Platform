import { parse } from 'csv-parse/sync';
import { normalizeName } from '../utils/normalizeName.js';
import { AppError } from '../utils/AppError.js';

// Pure CSV → product rows transform (no database). Validates the required
// columns, parses rows, normalizes names, and reports failed rows.
//
// Returns: { products: [{ item_no, name, normalized_name, createdAt }], failedRows: number }
// Throws AppError (422) for unparseable files, missing columns, or zero valid rows.
export function parseCatalogCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (e) {
    throw new AppError('UNPROCESSABLE', 'The file could not be parsed as CSV.', {
      status: 422,
      details: [{ issue: e.message }],
    });
  }

  if (!records.length) {
    throw new AppError('VALIDATION_ERROR', 'The CSV has no data rows.', { status: 422 });
  }

  // Resolve the required columns case-insensitively.
  const headers = Object.keys(records[0]);
  const itemKey = headers.find((h) => h.toLowerCase().trim() === 'item_no');
  const nameKey = headers.find((h) => h.toLowerCase().trim() === 'name');
  // Optional pack/variant column ("Option", e.g. "Box10") — display-only.
  const optionKey = headers.find((h) => h.toLowerCase().trim() === 'option');

  const missing = [];
  if (!itemKey) missing.push('item_no');
  if (!nameKey) missing.push('name');
  if (missing.length) {
    throw new AppError('UNPROCESSABLE', `Missing required column(s): ${missing.join(', ')}.`, {
      status: 422,
      details: missing.map((c) => ({ field: c, issue: 'required column missing' })),
    });
  }

  const products = [];
  let failedRows = 0;
  const now = new Date();

  for (const row of records) {
    const item_no = String(row[itemKey] ?? '').trim();
    const name = String(row[nameKey] ?? '').trim();
    if (!item_no || !name) {
      failedRows += 1;
      continue;
    }
    const option = optionKey ? String(row[optionKey] ?? '').trim() : '';
    products.push({ item_no, name, option, normalized_name: normalizeName(name), createdAt: now });
  }

  if (!products.length) {
    throw new AppError('VALIDATION_ERROR', 'No valid rows found; catalog not replaced.', { status: 422 });
  }

  return { products, failedRows };
}
