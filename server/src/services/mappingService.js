import { ApprovedMapping } from '../models/approvedMapping.model.js';
import { Product } from '../models/product.model.js';
import { normalizeName } from '../utils/normalizeName.js';
import { AppError } from '../utils/AppError.js';

// Maps a stored (snake_case) document to the frozen contract's Mapping shape.
// `normalized_email_name` is internal and intentionally not exposed.
export function toDto(doc) {
  return {
    id: doc._id,
    emailProductName: doc.email_product_name,
    websiteProductName: doc.website_product_name,
    itemNo: doc.item_no,
    approvedBy: doc.approved_by,
    approvedDate: doc.approved_date instanceof Date ? doc.approved_date.toISOString() : doc.approved_date,
    timesUsed: doc.times_used,
    status: doc.status,
  };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertItemInCatalog(itemNo) {
  const product = await Product.findOne({ item_no: itemNo }).lean();
  if (!product) {
    throw new AppError('UNPROCESSABLE', `Item number "${itemNo}" is not present in the active catalog.`, {
      status: 422,
      details: [{ field: 'itemNo', issue: 'not found in the active catalog' }],
    });
  }
}

// POST /mappings — create an approval. Rejects duplicates by normalized name.
export async function createMapping({ emailProductName, websiteProductName, itemNo, approvedBy = 'system' }) {
  const normalized = normalizeName(emailProductName);

  await assertItemInCatalog(itemNo);

  const existing = await ApprovedMapping.findOne({ normalized_email_name: normalized }).lean();
  if (existing) {
    throw new AppError('CONFLICT', `A mapping already exists for "${emailProductName}".`, {
      status: 409,
      details: [{ field: 'emailProductName', issue: 'mapping already exists', existing: toDto(existing) }],
    });
  }

  try {
    const doc = await ApprovedMapping.create({
      email_product_name: emailProductName,
      normalized_email_name: normalized,
      website_product_name: websiteProductName,
      item_no: itemNo,
      approved_by: approvedBy,
    });
    return toDto(doc);
  } catch (e) {
    // Safety net for a concurrent duplicate slipping past the pre-check.
    if (e && e.code === 11000) {
      throw new AppError('CONFLICT', 'A mapping already exists for this product.', { status: 409 });
    }
    throw e;
  }
}

// GET /mappings — paginated list/search.
export async function listMappings({ query, page = 1, pageSize = 50, status } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (query) {
    const rx = new RegExp(escapeRegex(query), 'i');
    filter.$or = [
      { email_product_name: rx },
      { website_product_name: rx },
      { item_no: rx },
      { normalized_email_name: rx },
    ];
  }

  const total = await ApprovedMapping.countDocuments(filter);
  const docs = await ApprovedMapping.find(filter)
    .sort({ approved_date: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return { data: docs.map(toDto), meta: { total, page, pageSize } };
}

// PATCH /mappings/:id — correct an existing mapping.
export async function updateMapping(id, { websiteProductName, itemNo, status }) {
  const doc = await ApprovedMapping.findById(id);
  if (!doc) {
    throw new AppError('NOT_FOUND', `No mapping found with id "${id}".`, { status: 404 });
  }

  if (itemNo !== undefined) {
    await assertItemInCatalog(itemNo);
    doc.item_no = itemNo;
  }
  if (websiteProductName !== undefined) {
    doc.website_product_name = websiteProductName;
  }
  if (status !== undefined) {
    if (!['active', 'retired'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'status must be "active" or "retired".', {
        status: 400,
        details: [{ field: 'status', issue: 'invalid value' }],
      });
    }
    doc.status = status;
  }

  await doc.save();
  return toDto(doc);
}
