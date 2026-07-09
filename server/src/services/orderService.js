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

// Map the stored (snake_case) document to the API DTO (camelCase).
export function toDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    filename: doc.filename,
    customerName: doc.customer_name,
    orderDate: doc.order_date,
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products,
    resolutionStatus: doc.resolution_status,
    parsedData: doc.parsed_data,
    resolutionData: doc.resolution_data,
    productComments: doc.product_comments || {},
    productFulfillment: doc.product_fulfillment || {},
  };
}

// Lightweight DTO for list views — omits the heavy parsed/resolution blobs.
export function toSummaryDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    filename: doc.filename,
    customerName: doc.customer_name,
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
}) {
  const resolution_status = deriveStatus(resolutionData);

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    {
      $set: {
        filename,
        customer_name: customerName,
        order_date: orderDate,
        total_products: totalProducts,
        resolution_status,
        parsed_data: parsedData ?? {},
        resolution_data: resolutionData ?? {},
        upload_timestamp: new Date(),
      },
      $setOnInsert: { portal_order_ref: portalOrderRef },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
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

// The only per-product comment values the platform knows.
export const PRODUCT_COMMENTS = ['Released', 'OS', 'N/A'];

// Merge per-product comments into an order without touching anything else.
// `comments` = { [lineId]: 'Released' | 'OS' | 'N/A' | null } — null/'' clears
// the comment for that line. Other lines' comments are preserved.
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

// List orders (summary only), newest first, optionally filtered by ref substring.
export async function listOrders({ query } = {}) {
  const filter = {};
  if (query) filter.portal_order_ref = new RegExp(escapeRegex(query), 'i');

  const docs = await Order.find(filter).sort({ upload_timestamp: -1 }).lean();
  return { data: docs.map(toSummaryDto), meta: { total: docs.length } };
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
