import { Order } from '../models/order.model.js';
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

// List orders (summary only), newest first, optionally filtered by ref substring.
export async function listOrders({ query } = {}) {
  const filter = {};
  if (query) filter.portal_order_ref = new RegExp(escapeRegex(query), 'i');

  const docs = await Order.find(filter).sort({ upload_timestamp: -1 }).lean();
  return { data: docs.map(toSummaryDto), meta: { total: docs.length } };
}

// Fetch one order (full detail) by Portal Order Ref No.
export async function getOrder(portalOrderRef) {
  const doc = await Order.findOne({ portal_order_ref: portalOrderRef }).lean();
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  return toDto(doc);
}
