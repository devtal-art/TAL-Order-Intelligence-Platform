import { randomUUID } from 'crypto';
import { Product } from '../models/product.model.js';
import { CatalogMeta } from '../models/catalogMeta.model.js';
import { parseCatalogCsv } from './catalogCsv.js';
import { normalizeName } from '../utils/normalizeName.js';

function makeVersion() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
  return `cat_${day}_${randomUUID().slice(0, 6)}`;
}

// Replace the entire catalog with the uploaded CSV.
// Per the task: delete all existing products, then insert the new catalog.
//
// Note on atomicity: the contract promises an atomic swap. True atomicity needs
// a MongoDB transaction (replica set) or the version-flip pattern; that is
// deferred. Here we follow the task's delete-then-insert exactly.
export async function replaceCatalog({ buffer, filename, uploadedBy = 'system' }) {
  const { products, failedRows } = parseCatalogCsv(buffer);

  await Product.deleteMany({});
  await Product.insertMany(products, { ordered: false });

  const version = makeVersion();
  const uploadedAt = new Date();
  await CatalogMeta.deleteMany({});
  await CatalogMeta.create({
    version,
    filename,
    productCount: products.length,
    uploadedBy,
    uploadedAt,
    status: 'active',
  });

  return {
    version,
    filename,
    productCount: products.length,
    rejectedRows: failedRows,
    uploadedBy,
    uploadedAt: uploadedAt.toISOString(),
    status: 'active',
  };
}

// Return metadata about the active catalog, or a "none" status when empty.
export async function getStatus() {
  const productCount = await Product.countDocuments();
  const meta = await CatalogMeta.findOne().sort({ uploadedAt: -1 }).lean();

  if (productCount === 0 || !meta) {
    return { status: 'none', version: null, filename: null, productCount: 0, uploadedBy: null, uploadedAt: null };
  }

  return {
    version: meta.version,
    filename: meta.filename,
    productCount,
    uploadedBy: meta.uploadedBy,
    uploadedAt: meta.uploadedAt instanceof Date ? meta.uploadedAt.toISOString() : meta.uploadedAt,
    status: 'active',
  };
}

// GET /catalog/products — free-text search over the active catalog.
// Filters by normalized substring / token presence and ranks by relevance.
// Returns the contract shape: { data: [{ websiteProductName, itemNo, matchPercent }], meta }.
export async function searchProducts(query, limit) {
  const qNorm = normalizeName(query);
  const qTokens = qNorm.split(' ').filter(Boolean);

  const products = await Product.find({}, { item_no: 1, name: 1, _id: 0 }).lean();

  const scored = [];
  for (const p of products) {
    const nNorm = normalizeName(p.name);
    const contains = nNorm.includes(qNorm);
    let hits = 0;
    for (const t of qTokens) {
      if (nNorm.includes(t)) hits += 1;
    }
    if (!contains && hits === 0) continue;
    const matchPercent = qTokens.length ? Math.round((hits / qTokens.length) * 100) : contains ? 100 : 0;
    scored.push({ websiteProductName: p.name, itemNo: p.item_no, matchPercent, _c: contains ? 1 : 0, _len: nNorm.length });
  }

  scored.sort(
    (a, b) => b._c - a._c || b.matchPercent - a.matchPercent || a._len - b._len || a.websiteProductName.localeCompare(b.websiteProductName)
  );

  const total = scored.length;
  const data = scored.slice(0, limit).map(({ _c, _len, ...rest }) => rest);
  return { data, meta: { total, returned: data.length } };
}
