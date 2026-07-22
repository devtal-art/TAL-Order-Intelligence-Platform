import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { productDisplayName } from '../utils/displayName.js';
import { AppError } from '../utils/AppError.js';

// ────────────────────────────────────────────────
//  ORDER SERVICE (V1.2 — new, additive)
//
//  Persists one Order per uploaded HTML, keyed by Portal Order Ref No. The
//  product workflow (parser, matching, resolve, approval, Excel) is untouched;
//  this layer only records the order and mirrors its resolution status.
// ────────────────────────────────────────────────

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Order status is a pure function of its products' resolution results:
//   • every product approved        → 'resolved'
//   • some (not all) approved        → 'partially_resolved'
//   • none approved / no products    → 'needs_review'
export function deriveStatus(resolutionData) {
  const list = Array.isArray(resolutionData?.results) ? resolutionData.results : [];
  if (!list.length) return 'needs_review';
  const approved = list.filter((r) => r && r.status === 'approved').length;
  if (approved === 0) return 'needs_review';
  if (approved === list.length) return 'resolved';
  return 'partially_resolved';
}

// Delivery postcode lives inside the stored parsed email snapshot, so every
// order — including ones saved before this field was surfaced — has it.
function deliveryPostcode(doc) {
  return doc.parsed_data?.delivery_address?.post_code || '';
}

// The team members who can be assigned as an order's processor (V1.9).
export const PROCESSED_BY_USERS = ['Jasmeet', 'Shubham', 'Alpa', 'Sahil'];

// Map the stored (snake_case) document to the API DTO (camelCase).
export function toDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    filename: doc.filename,
    customerName: doc.customer_name,
    // '' for orders saved before V1.9 — the client renders "Not Assigned".
    processedBy: doc.processed_by || '',
    deliveryPostcode: deliveryPostcode(doc),
    orderDate: doc.order_date,
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products,
    resolutionStatus: doc.resolution_status,
    parsedData: doc.parsed_data,
    resolutionData: doc.resolution_data,
    productComments: doc.product_comments || {},
    productFulfillment: doc.product_fulfillment || {},
    // Older orders have no product_notes field — treat as empty (V1.7).
    productNotes: doc.product_notes || {},
  };
}

// Lightweight DTO for list views — omits the heavy parsed/resolution blobs.
export function toSummaryDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    filename: doc.filename,
    customerName: doc.customer_name,
    processedBy: doc.processed_by || '',
    deliveryPostcode: deliveryPostcode(doc),
    orderDate: doc.order_date,
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products,
    resolutionStatus: doc.resolution_status,
  };
}

// Create-or-update one order by Portal Order Ref No. Re-uploading the same ref
// overwrites the previous snapshot (idempotent by design).
export async function upsertOrder({
  portalOrderRef,
  filename = '',
  customerName = '',
  orderDate = '',
  totalProducts = 0,
  parsedData = {},
  resolutionData = {},
  processedBy = '',
}) {
  const resolution_status = deriveStatus(resolutionData);

  const set = {
    filename,
    customer_name: customerName,
    order_date: orderDate,
    total_products: totalProducts,
    resolution_status,
    parsed_data: parsedData ?? {},
    resolution_data: resolutionData ?? {},
    upload_timestamp: new Date(),
  };

  // Processed By (V1.9): set only when explicitly provided — saves that omit
  // it (manual add/remove product, resolution mirrors) must never clear an
  // existing assignment.
  const pb = String(processedBy ?? '').trim();
  if (pb) {
    if (!PROCESSED_BY_USERS.includes(pb)) {
      throw new AppError('VALIDATION_ERROR', `Processed By must be one of: ${PROCESSED_BY_USERS.join(', ')}.`, {
        status: 400,
        details: [{ field: 'processedBy', issue: 'invalid value' }],
      });
    }
    set.processed_by = pb;
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    {
      $set: set,
      $setOnInsert: { portal_order_ref: portalOrderRef },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return toDto(doc);
}

// Assign the order's Processed By (V1.9). ONE-SHOT by business rule (V1.9.1):
// the value can be set only while the order is unassigned (legacy orders show
// "Not Assigned" and can be assigned once) — after that it is immutable and
// any change attempt is rejected. Assigning the identical value again is an
// idempotent no-op.
export async function setProcessedBy(portalOrderRef, processedBy) {
  const value = processedBy === null || processedBy === undefined ? '' : String(processedBy).trim();
  if (!value || !PROCESSED_BY_USERS.includes(value)) {
    throw new AppError('VALIDATION_ERROR', `Processed By must be one of: ${PROCESSED_BY_USERS.join(', ')}.`, {
      status: 400,
      details: [{ field: 'processedBy', issue: 'invalid value' }],
    });
  }

  const existing = await Order.findOne({ portal_order_ref: portalOrderRef }, { processed_by: 1 }).lean();
  if (!existing) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  if (existing.processed_by && existing.processed_by !== value) {
    throw new AppError('CONFLICT', `Processed By is already assigned to ${existing.processed_by} and cannot be changed.`, {
      status: 409,
      details: [{ field: 'processedBy', issue: 'immutable once assigned' }],
    });
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { processed_by: value } },
    { new: true }
  );
  return toDto(doc);
}

// Update only the resolution snapshot (used after a product is approved) and
// recompute the derived order status.
export async function updateResolution(portalOrderRef, resolutionData) {
  const resolution_status = deriveStatus(resolutionData);

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { resolution_data: resolutionData ?? {}, resolution_status } },
    { new: true }
  );

  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  return toDto(doc);
}

// The only per-product comment values the platform knows. 'Not Found' (V2.1)
// marks matching as intentionally skipped for THIS order only — it is stored
// exactly like the other comments and deliberately has NO effect anywhere
// else: it never creates an Approved Mapping, never touches the Product
// Catalog, and never influences the matching engine or future orders.
export const PRODUCT_COMMENTS = ['Released', 'OS', 'Not Found'];

// Merge per-product comments into an order without touching anything else.
// `comments` = { [lineId]: 'Released' | 'OS' | 'N/A' | 'Not Found' | null } —
// null/'' clears the comment for that line. Other lines' comments are preserved.
export async function setProductComments(portalOrderRef, comments) {
  const set = {};
  const unset = {};
  for (const [lineId, value] of Object.entries(comments || {})) {
    const key = `product_comments.${lineId}`;
    if (value === null || value === undefined || String(value).trim() === '') {
      unset[key] = '';
    } else {
      if (!PRODUCT_COMMENTS.includes(value)) {
        throw new AppError('VALIDATION_ERROR', `Comment must be one of: ${PRODUCT_COMMENTS.join(', ')}.`, {
          status: 400,
          details: [{ field: `comments.${lineId}`, issue: 'invalid value' }],
        });
      }
      set[key] = value;
    }
  }

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(update).length) {
    throw new AppError('VALIDATION_ERROR', 'No comments provided.', {
      status: 400,
      details: [{ field: 'comments', issue: 'required' }],
    });
  }

  const doc = await Order.findOneAndUpdate({ portal_order_ref: portalOrderRef }, update, { new: true });
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  return toDto(doc);
}

// Longest accepted Additional Comment (free-text per-product note, V1.7).
export const NOTE_MAX_LENGTH = 2000;

// Merge per-product free-text notes ("Additional Comment", V1.7) into an order
// without touching anything else — mirrors setProductComments exactly.
// `notes` = { [lineId]: string | null } — null/'' clears the note for that
// line. Values are trimmed at the ends only, so line breaks inside the note
// are preserved. Other lines' notes are untouched.
export async function setProductNotes(portalOrderRef, notes) {
  const set = {};
  const unset = {};
  for (const [lineId, value] of Object.entries(notes || {})) {
    const key = `product_notes.${lineId}`;
    if (value === null || value === undefined || String(value).trim() === '') {
      unset[key] = '';
    } else {
      if (typeof value !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'Additional comment must be text.', {
          status: 400,
          details: [{ field: `notes.${lineId}`, issue: 'must be a string' }],
        });
      }
      const trimmed = value.trim();
      if (trimmed.length > NOTE_MAX_LENGTH) {
        throw new AppError('VALIDATION_ERROR', `Additional comment must be ${NOTE_MAX_LENGTH} characters or fewer.`, {
          status: 400,
          details: [{ field: `notes.${lineId}`, issue: `max ${NOTE_MAX_LENGTH} characters` }],
        });
      }
      set[key] = trimmed;
    }
  }

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(update).length) {
    throw new AppError('VALIDATION_ERROR', 'No notes provided.', {
      status: 400,
      details: [{ field: 'notes', issue: 'required' }],
    });
  }

  const doc = await Order.findOneAndUpdate({ portal_order_ref: portalOrderRef }, update, { new: true });
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  return toDto(doc);
}

// Per-product delivery statuses (V1.4). Stored values; the client renders the
// display labels (Delivered / Half Delivered / Not Delivered).
export const DELIVERY_STATUSES = ['delivered', 'half_delivered', 'not_delivered'];

// Validate one line's fulfilment patch (V1.4). Pure — unit-testable, no DB.
// `patch` = { pendingQty?, status? }; either field may be null/'' to clear it.
// `orderedQty` is the line's parsed quantity (pendingQty may never exceed it);
// a non-finite orderedQty skips the upper bound (line item missing/unparsable).
// Returns { set: {…}, unset: […] } with field names relative to the entry.
export function validateFulfillmentPatch(patch, orderedQty, lineId = '') {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new AppError('VALIDATION_ERROR', 'Each fulfillment entry must be an object or null.', {
      status: 400,
      details: [{ field: `fulfillment.${lineId}`, issue: 'invalid value' }],
    });
  }

  const set = {};
  const unset = [];

  if ('pendingQty' in patch) {
    const raw = patch.pendingQty;
    if (raw === null || String(raw).trim() === '') {
      unset.push('pendingQty');
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        throw new AppError('VALIDATION_ERROR', 'Pending quantity must be an integer of 0 or more.', {
          status: 400,
          details: [{ field: `fulfillment.${lineId}.pendingQty`, issue: 'must be an integer ≥ 0' }],
        });
      }
      if (Number.isFinite(orderedQty) && n > orderedQty) {
        throw new AppError('VALIDATION_ERROR', `Pending quantity cannot exceed the ordered quantity (${orderedQty}).`, {
          status: 400,
          details: [{ field: `fulfillment.${lineId}.pendingQty`, issue: `must be ≤ ${orderedQty}` }],
        });
      }
      set.pendingQty = n;
    }
  }

  if ('status' in patch) {
    const raw = patch.status;
    if (raw === null || String(raw).trim() === '') {
      unset.push('status');
    } else if (!DELIVERY_STATUSES.includes(raw)) {
      throw new AppError('VALIDATION_ERROR', `Status must be one of: ${DELIVERY_STATUSES.join(', ')}.`, {
        status: 400,
        details: [{ field: `fulfillment.${lineId}.status`, issue: 'invalid value' }],
      });
    } else {
      set.status = raw;
    }
  }

  return { set, unset };
}

// Merge per-product delivery tracking into an order without touching anything
// else (V1.4 — mirrors setProductComments). `fulfillment` =
// { [lineId]: { pendingQty?, status? } | null } — null removes the whole
// entry; a null/'' field inside a patch clears just that field. Other lines'
// entries are preserved.
export async function setProductFulfillment(portalOrderRef, fulfillment) {
  const entries = Object.entries(fulfillment || {});
  if (!entries.length) {
    throw new AppError('VALIDATION_ERROR', 'No fulfillment entries provided.', {
      status: 400,
      details: [{ field: 'fulfillment', issue: 'required' }],
    });
  }

  // Ordered quantities come from the stored parsed line items (lineId is the
  // 1-based index into line_items) — the upper bound for pendingQty.
  const doc = await Order.findOne({ portal_order_ref: portalOrderRef }, { parsed_data: 1 }).lean();
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  const items = Array.isArray(doc.parsed_data?.line_items) ? doc.parsed_data.line_items : [];

  const set = {};
  const unset = {};
  for (const [lineId, patch] of entries) {
    const key = `product_fulfillment.${lineId}`;
    if (patch === null || patch === undefined) {
      unset[key] = '';
      continue;
    }
    const orderedQty = Number(items[Number(lineId) - 1]?.qty);
    const validated = validateFulfillmentPatch(patch, orderedQty, lineId);
    for (const [field, value] of Object.entries(validated.set)) set[`${key}.${field}`] = value;
    for (const field of validated.unset) unset[`${key}.${field}`] = '';
  }

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(update).length) {
    throw new AppError('VALIDATION_ERROR', 'No fulfillment fields provided.', {
      status: 400,
      details: [{ field: 'fulfillment', issue: 'entries contain no fields to change' }],
    });
  }

  const updated = await Order.findOneAndUpdate({ portal_order_ref: portalOrderRef }, update, { new: true });
  if (!updated) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  return toDto(updated);
}

// ────────────────────────────────────────────────
//  DASHBOARD (V2.2 — new, additive, read-only)
//
//  The dashboard is ALWAYS derived live from the Orders collection — no
//  summary collections, no duplicated data, no denormalised counters. An
//  order belongs to a bucket when AT LEAST ONE of its products carries that
//  delivery status (product_fulfillment) or comment (product_comments).
//  Both maps are lineId-keyed objects, so the aggregation unpacks them with
//  $objectToArray into flat value arrays and matches on array membership.
//  Everything below is read-only: nothing here ever writes an order.
// ────────────────────────────────────────────────

// Safely turn a Mixed map field into its entry array inside the pipeline.
// Older orders may lack the field entirely (V1.2 docs) — $type guards every
// non-object shape (missing, null, legacy junk) down to an empty object.
function mapEntries(field) {
  return {
    $objectToArray: {
      $cond: [{ $eq: [{ $type: `$${field}` }, 'object'] }, `$${field}`, {}],
    },
  };
}

// Shared first stage: strip each order to the summary fields the dashboard
// cards need, plus flat arrays of its products' delivery statuses / comments.
// parsed_data / resolution_data are dropped immediately so the heavy blobs
// never flow through the pipeline (or over the wire).
const DASHBOARD_FIELDS_STAGE = {
  $project: {
    portal_order_ref: 1,
    customer_name: 1,
    processed_by: 1,
    order_date: 1,
    upload_timestamp: 1,
    total_products: 1,
    resolution_status: 1,
    delivery_statuses: { $map: { input: mapEntries('product_fulfillment'), as: 'e', in: '$$e.v.status' } },
    comment_values: { $map: { input: mapEntries('product_comments'), as: 'e', in: '$$e.v' } },
  },
};

// Map a dashboard-projected document to the card DTO. Deliberately lean —
// exactly what an order card renders (ref, customer, processed by, date).
function toDashboardCardDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    customerName: doc.customer_name || '',
    processedBy: doc.processed_by || '',
    orderDate: doc.order_date || '',
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products ?? 0,
    resolutionStatus: doc.resolution_status || 'needs_review',
  };
}

const clampInt = (raw, def, min, max) => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

// One round trip for the whole dashboard: a single $facet aggregation returns,
// for every delivery status AND every comment value, the bucket's total count
// plus its latest `previewLimit` orders (newest upload first). Facet keys use
// indexes, not raw values ('N/A' contains '/', 'Not Found' a space).
export async function getDashboardSummary({ previewLimit } = {}) {
  const limit = clampInt(previewLimit, 5, 1, 20);

  const facets = {};
  const bucket = (key, matchField, value) => {
    facets[`${key}_orders`] = [
      { $match: { [matchField]: value } },
      { $sort: { upload_timestamp: -1 } },
      { $limit: limit },
    ];
    facets[`${key}_count`] = [{ $match: { [matchField]: value } }, { $count: 'n' }];
  };
  DELIVERY_STATUSES.forEach((status, i) => bucket(`s${i}`, 'delivery_statuses', status));
  PRODUCT_COMMENTS.forEach((comment, i) => bucket(`c${i}`, 'comment_values', comment));

  // Overview stats — total orders, orders uploaded today, and Released orders
  // broken down by processor — power the three summary cards atop the page.
  facets.total_count = [{ $count: 'n' }];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  facets.today_count = [{ $match: { upload_timestamp: { $gte: startOfToday } } }, { $count: 'n' }];
  facets.released_by_processor = [
    { $match: { comment_values: 'Released' } },
    { $group: { _id: '$processed_by', n: { $sum: 1 } } },
  ];

  const [agg] = await Order.aggregate([DASHBOARD_FIELDS_STAGE, { $facet: facets }]);

  const readBucket = (key, value) => ({
    value,
    total: agg[`${key}_count`]?.[0]?.n ?? 0,
    orders: (agg[`${key}_orders`] || []).map(toDashboardCardDto),
  });

  const releasedByProcessor = {};
  for (const user of PROCESSED_BY_USERS) releasedByProcessor[user] = 0;
  for (const row of agg.released_by_processor || []) {
    if (row._id in releasedByProcessor) releasedByProcessor[row._id] = row.n;
  }

  return {
    previewLimit: limit,
    totalOrders: agg.total_count?.[0]?.n ?? 0,
    todayOrders: agg.today_count?.[0]?.n ?? 0,
    releasedByProcessor,
    statuses: DELIVERY_STATUSES.map((status, i) => readBucket(`s${i}`, status)),
    comments: PRODUCT_COMMENTS.map((comment, i) => readBucket(`c${i}`, comment)),
  };
}

// Full filtered list for a single dashboard bucket ("View All"), paginated.
// `type` = 'status' (delivery status) | 'comment' (product comment); `value`
// is validated against the platform's known values so the match can never be
// driven by arbitrary input.
export async function listDashboardOrders({ type, value, page, limit } = {}) {
  const known = { status: DELIVERY_STATUSES, comment: PRODUCT_COMMENTS };
  const allowed = known[type];
  if (!allowed) {
    throw new AppError('VALIDATION_ERROR', "type must be 'status' or 'comment'.", {
      status: 400,
      details: [{ field: 'type', issue: 'invalid value' }],
    });
  }
  if (!allowed.includes(value)) {
    throw new AppError('VALIDATION_ERROR', `value must be one of: ${allowed.join(', ')}.`, {
      status: 400,
      details: [{ field: 'value', issue: 'invalid value' }],
    });
  }

  const pageN = clampInt(page, 1, 1, 100000);
  const limitN = clampInt(limit, 25, 1, 100);
  const matchField = type === 'status' ? 'delivery_statuses' : 'comment_values';

  const [agg] = await Order.aggregate([
    DASHBOARD_FIELDS_STAGE,
    { $match: { [matchField]: value } },
    { $sort: { upload_timestamp: -1 } },
    {
      $facet: {
        data: [{ $skip: (pageN - 1) * limitN }, { $limit: limitN }],
        count: [{ $count: 'n' }],
      },
    },
  ]);

  const total = agg?.count?.[0]?.n ?? 0;
  return {
    data: (agg?.data || []).map(toDashboardCardDto),
    meta: { type, value, total, page: pageN, limit: limitN, pages: Math.max(1, Math.ceil(total / limitN)) },
  };
}

// List orders (summary only), newest first, optionally filtered by ref
// substring or exact company name. `limit` (V2.3, optional, additive) caps the
// result — used by the Search page's "Recent Processed Orders" preview.
export async function listOrders({ query, company, limit } = {}) {
  const filter = {};
  if (query) filter.portal_order_ref = new RegExp(escapeRegex(query), 'i');
  if (company) filter.customer_name = new RegExp(escapeRegex(company), 'i');
  let find = Order.find(filter).sort({ upload_timestamp: -1 });
  const n = Math.floor(Number(limit));
  if (Number.isFinite(n) && n > 0) find = find.limit(Math.min(n, 100));

  const docs = await find.lean();
  return { data: docs.map(toSummaryDto), meta: { total: docs.length } };
}

// Autocomplete company names for the search dropdown. Groups matching orders
// by customer_name and sorts by match quality (exact > prefix > substring > alphabetical).
export async function autocompleteCompanies(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }
  const q = query.trim();
  const regex = new RegExp(escapeRegex(q), 'i');
  
  const pipeline = [
    { $match: { customer_name: regex } },
    {
      $group: {
        _id: '$customer_name',
        orderCount: { $sum: 1 },
        latestOrderRef: { $first: '$portal_order_ref' },
        latestOrderDate: { $max: '$upload_timestamp' }
      }
    }
  ];
  
  const results = await Order.aggregate(pipeline);
  
  const qLower = q.toLowerCase();
  
  results.sort((a, b) => {
    const nameA = a._id.toLowerCase();
    const nameB = b._id.toLowerCase();
    
    const isExactA = nameA === qLower;
    const isExactB = nameB === qLower;
    if (isExactA !== isExactB) return isExactA ? -1 : 1;
    
    const isPrefixA = nameA.startsWith(qLower);
    const isPrefixB = nameB.startsWith(qLower);
    if (isPrefixA !== isPrefixB) return isPrefixA ? -1 : 1;
    
    return nameA.localeCompare(nameB);
  });
  
  return results.slice(0, 10).map(r => ({
    companyName: r._id,
    orderCount: r.orderCount,
    latestOrderRef: r.latestOrderRef
  }));
}

// Rewrite the website product names inside a resolution snapshot to the live
// catalog's display names — "Name (Option)" (V1.5). Pure and display-only:
// the stored snapshot is never modified, which is what lets orders saved
// BEFORE the Option column existed show it too. Items no longer in the
// catalog keep their stored name.
export function withCatalogDisplayNames(resolutionData, productByItemNo) {
  const results = Array.isArray(resolutionData?.results) ? resolutionData.results : null;
  if (!results || !productByItemNo?.size) return resolutionData;

  const rename = (ref) => {
    if (!ref || !ref.itemNo) return ref;
    const p = productByItemNo.get(ref.itemNo);
    return p ? { ...ref, websiteProductName: productDisplayName(p.name, p.option) } : ref;
  };

  return {
    ...resolutionData,
    results: results.map((r) => {
      if (!r) return r;
      const next = { ...r };
      if (r.match) next.match = rename(r.match);
      if (r.suggestedProduct) next.suggestedProduct = rename(r.suggestedProduct);
      if (Array.isArray(r.candidates)) next.candidates = r.candidates.map(rename);
      return next;
    }),
  };
}

// Fetch one order (full detail) by Portal Order Ref No. The resolution
// snapshot's website names are rendered as live catalog display names
// ("Name (Option)") — see withCatalogDisplayNames.
export async function getOrder(portalOrderRef) {
  const doc = await Order.findOne({ portal_order_ref: portalOrderRef }).lean();
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  const dto = toDto(doc);

  const itemNos = new Set();
  for (const r of doc.resolution_data?.results ?? []) {
    if (r?.match?.itemNo) itemNos.add(r.match.itemNo);
    if (r?.suggestedProduct?.itemNo) itemNos.add(r.suggestedProduct.itemNo);
    for (const c of r?.candidates ?? []) if (c?.itemNo) itemNos.add(c.itemNo);
  }
  if (itemNos.size) {
    const prods = await Product.find(
      { item_no: { $in: [...itemNos] } },
      { item_no: 1, name: 1, option: 1, _id: 0 }
    ).lean();
    dto.resolutionData = withCatalogDisplayNames(dto.resolutionData, new Map(prods.map((p) => [p.item_no, p])));
  }
  return dto;
}
