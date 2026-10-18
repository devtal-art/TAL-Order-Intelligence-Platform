import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';
import { productDisplayName } from '../utils/displayName.js';
import { AppError } from '../utils/AppError.js';
import { parseFlexibleDate, daysBetween } from '../utils/dateUtil.js';
import { recordLog } from './orderLogService.js';

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

// The team members who can be assigned as an order's processor — dynamic
// (Admin Portal — additive), replacing what used to be a hardcoded list
// duplicated here and in client/src/utils/order.js. Sourced live from the
// User collection so a newly created employee, a rename, or a delete is
// reflected immediately with no list to hand-edit. 'viewer'/'admin' roles
// are excluded (they can't process orders), and excludeFromProcessorList
// keeps legacy exceptions (the 'Dev Team' account) out without needing a
// name-based check that a rename could break. GET /v1/orders/processors
// exposes this same list to the client (orderController.getProcessors).
export async function getProcessedByUsers() {
  const docs = await User.find({
    active: true,
    role: { $nin: ['viewer', 'admin'] },
    excludeFromProcessorList: { $ne: true },
  })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return docs.map((d) => d.name);
}

// Map the stored (snake_case) document to the API DTO (camelCase).
export function toDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    filename: doc.filename,
    customerName: doc.customer_name,
    // '' for orders saved before V1.9 — the client renders "Not Assigned".
    processedBy: doc.processed_by || '',
    // Set only when Delete Employee reassigned this order to Chat Team —
    // the employee's name at the time of delete. '' otherwise (never
    // reassigned, or reassigned by an older build before this field
    // existed). The client shows this struck through next to processedBy.
    processedByOriginal: doc.processed_by_original || '',
    deliveryPostcode: deliveryPostcode(doc),
    orderDate: doc.order_date,
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products,
    resolutionStatus: doc.resolution_status,
    // 'HTML' for orders saved before V3.1 (Manual Order Creation) — undefined reads as HTML.
    orderSource: doc.order_source || 'HTML',
    // '' for orders not yet backfilled by migrateOrderChannel.js — display-
    // only, never written to the DB (V3.5). Distinct from orderSource above.
    orderChannel: doc.order_channel || '',
    parsedData: doc.parsed_data,
    resolutionData: doc.resolution_data,
    productComments: doc.product_comments || {},
    productFulfillment: doc.product_fulfillment || {},
    // Older orders have no product_notes field — treat as empty (V1.7).
    productNotes: doc.product_notes || {},
    // Orders whose status hasn't landed yet (the brief window between the
    // core save and the follow-up setOrderStatus call, or a failed one) show
    // as '' — display-only, never written to the DB. No 'Unknown' fallback
    // (V3.3): the frontend renders '' as a plain "—", not a fake status.
    orderStatus: doc.order_status || '',
    orderComment: doc.order_comment || '',
    // Falls back to the legacy Manual Order Creation location (parsed_data.
    // order_info.delivery_date) for orders saved before delivery_date became
    // its own top-level field (V4.2) — display-only, never written back.
    deliveryDate: doc.delivery_date || doc.parsed_data?.order_info?.delivery_date || '',
    // Discount Provided toggle (display-only bucket classification alongside
    // it — see classifyDiscountBucket below). '' when the order has no
    // discount at all, so the client knows not to show the small message.
    discountProvided: Boolean(doc.discount_provided),
    discountBucket: classifyDiscountBucket(doc.parsed_data) || '',
    litInvoice: Boolean(doc.lit_invoice),
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
    processedByOriginal: doc.processed_by_original || '',
    deliveryPostcode: deliveryPostcode(doc),
    orderDate: doc.order_date,
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products,
    resolutionStatus: doc.resolution_status,
    orderSource: doc.order_source || 'HTML',
    orderChannel: doc.order_channel || '',
  };
}

// Order Channel values (V3.5) — see order_channel's schema comment for why
// this is separate from ORDER_SOURCES/order_source below. Never presented as
// a user-facing choice (upsertOrder derives it automatically); exported only
// so migrateOrderChannel.js shares the exact same literal values as the
// write path instead of re-declaring them.
export const ORDER_CHANNELS = ['Orders - Email', 'Order - Kumkum'];

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
  orderSource,
  actor,
  actorRole,
  // Optional (Order Activity Log) — the client's reason for calling this on
  // an ALREADY-EXISTING order (Add Product / Remove Product). Omitted for a
  // genuine first save or a re-upload of the same ref, both of which are
  // distinguished from a plain "product added/removed" edit for the log.
  reason,
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

  // Processed By (V3.0 — JWT Auth): the value now comes exclusively from
  // req.user.name (set by the authenticate middleware), so it is always a
  // valid authenticated user. We no longer check against a static whitelist
  // here; the whitelist lives at the authentication layer (the User collection).
  // We still guard against accidental empty strings for robustness.
  const pb = String(processedBy ?? '').trim();
  if (pb) {
    set.processed_by = pb;
  }

  // Order source (V3.1 — Manual Order Creation, optional). Omitted entirely by
  // the HTML upload flow, so those orders simply keep/get the schema default
  // ('HTML') via setDefaultsOnInsert — byte-identical behavior to before this
  // field existed.
  const src = String(orderSource ?? '').trim();
  if (src) {
    set.order_source = src;
  }

  // Order Channel (V3.5) — derived automatically from the SAME signal as
  // order_source above, never asked of the user. Always included (both
  // insert and every re-save/re-upload of an existing order) since it's a
  // deterministic fact about the order that never changes — no default
  // needed, and no risk of it silently drifting between saves.
  set.order_channel = src === 'MANUAL' ? 'Order - Kumkum' : 'Orders - Email';

  // Mongoose 8 renamed the findOneAndUpdate "return the full driver result"
  // option from `rawResult` to `includeResultMetadata` — `rawResult` is
  // silently ignored (not an error), which would otherwise make this resolve
  // to the plain document and `.value`/`.lastErrorObject` read as undefined.
  const rawResult = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    {
      $set: set,
      $setOnInsert: { portal_order_ref: portalOrderRef },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, includeResultMetadata: true }
  );
  const doc = rawResult.value;
  const wasInserted = Boolean(rawResult.lastErrorObject?.upserted);

  if (actor) {
    let action;
    let message;
    if (wasInserted) {
      action = 'order_created';
      message = `Order uploaded and saved${filename ? ` (${filename})` : ''}`;
    } else if (reason === 'product_added') {
      action = 'product_added';
      message = 'Product added to order';
    } else if (reason === 'product_removed') {
      action = 'product_removed';
      message = 'Product removed from order';
    } else {
      action = 'order_reuploaded';
      message = 'Order re-uploaded and saved';
    }
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action,
      message,
      details: { filename, totalProducts },
    });
  }

  return toDto(doc);
}

// Manual Order Creation — auto-numbering (V5). Every "Orders - Kumkum" order
// number follows 'KS-YYYYMMDD-N', N a per-day sequence starting at 1 — no
// free typing. getNextManualOrderRef is a PREVIEW only (for display while
// the form is open); createManualOrder below is the authoritative,
// race-safe assignment made at actual save time.
function todayDatePrefix() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function nextRefForDate(datePrefix) {
  const re = new RegExp(`^KS-${datePrefix}-(\\d+)$`);
  const docs = await Order.find({ portal_order_ref: re }, { portal_order_ref: 1 }).lean();
  let maxN = 0;
  for (const d of docs) {
    const m = re.exec(d.portal_order_ref);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  return `KS-${datePrefix}-${maxN + 1}`;
}

// What the next manual order's ref WOULD be right now — for display only,
// while Create Manual Order is open. Can drift by one if someone else saves
// a manual order in between; harmless, since createManualOrder recomputes
// authoritatively at actual save time and the form shows whatever ref
// really got assigned once the save succeeds.
export async function getNextManualOrderRef() {
  return nextRefForDate(todayDatePrefix());
}

// Create a brand-new manual order with a SERVER-assigned ref — never a
// client-supplied one — so two people saving at the same moment can never
// collide. Race-safe via the ref's own unique index: attempts an insert
// with the next computed number, and on a duplicate-key collision (someone
// else grabbed that exact number a moment earlier) recomputes and retries,
// bounded so a persistent failure still surfaces instead of looping forever.
export async function createManualOrder({
  customerName = '',
  orderDate = '',
  totalProducts = 0,
  parsedData = {},
  resolutionData = {},
  processedBy = '',
  actor,
  actorRole,
} = {}) {
  const resolution_status = deriveStatus(resolutionData);
  const datePrefix = todayDatePrefix();
  const pb = String(processedBy ?? '').trim();

  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const portalOrderRef = await nextRefForDate(datePrefix);
    try {
      const doc = await Order.create({
        portal_order_ref: portalOrderRef,
        filename: '',
        customer_name: customerName,
        order_date: orderDate,
        total_products: totalProducts,
        resolution_status,
        parsed_data: parsedData ?? {},
        resolution_data: resolutionData ?? {},
        upload_timestamp: new Date(),
        ...(pb ? { processed_by: pb } : {}),
        order_source: 'MANUAL',
        order_channel: 'Order - Kumkum',
      });
      if (actor) {
        await recordLog({
          portalOrderRef,
          actor,
          actorRole,
          action: 'manual_order_created',
          message: 'Manual order created',
          details: { customerName, totalProducts },
        });
      }
      return toDto(doc);
    } catch (err) {
      // E11000 duplicate key on portal_order_ref — another manual order
      // grabbed this exact number between our read and write. Recompute
      // and retry; any other error is a real failure, propagate it as-is.
      if (err?.code !== 11000) throw err;
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new AppError('CONFLICT', 'Could not assign a unique manual order number — please try again.', { status: 409 });
      }
    }
  }
}

// Assign the order's Processed By (V1.9). ONE-SHOT by business rule (V1.9.1):
// the value can be set only while the order is unassigned (legacy orders show
// "Not Assigned" and can be assigned once) — after that it is immutable and
// any change attempt is rejected. Assigning the identical value again is an
// idempotent no-op.
export async function setProcessedBy(portalOrderRef, processedBy, { actor, actorRole } = {}) {
  const value = processedBy === null || processedBy === undefined ? '' : String(processedBy).trim();
  const processedByUsers = await getProcessedByUsers();
  if (!value || !processedByUsers.includes(value)) {
    throw new AppError('VALIDATION_ERROR', `Processed By must be one of: ${processedByUsers.join(', ')}.`, {
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
  if (actor) {
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action: 'processed_by_set',
      message: `Order assigned to ${value}`,
      details: { to: value },
    });
  }
  return toDto(doc);
}

// Overall order status (V3.2; 'Unknown' removed V3.3 — no order is ever
// left in an unclassified legacy state anymore). Distinct from
// PRODUCT_COMMENTS/DELIVERY_STATUSES: this is a single order-level field,
// not a per-lineId map. 'Order Comments' removed V3.4 — no order ever used
// it (verified against the live DB before removal); the dashboard's Order
// Comments section is now driven by a non-empty order_comment instead.
// 'Order Released but Half' removed V5.9 — no longer needed at order level;
// a half-released line is still recorded per product in product_fulfillment
// ('half_delivered', shown as Item Status "Half Released").
export const ORDER_STATUSES = [
  'Order Released',
  'Order Hold',
  'Order Cancelled',
  'Order Released but Problem',
];

// Longest accepted Order Comment (mirrors NOTE_MAX_LENGTH's per-product cap).
export const ORDER_COMMENT_MAX_LENGTH = 2000;

// Set the overall Order Status + Order Comment (V3.2). Both are order-level,
// independent of every per-product field (Item Status, Reason, Comments).
// orderStatus must be one of ORDER_STATUSES — arbitrary values (including
// 'Unknown') are rejected. orderComment is optional free text.
export async function setOrderStatus(portalOrderRef, { orderStatus, orderComment, actor, actorRole } = {}) {
  if (!ORDER_STATUSES.includes(orderStatus)) {
    throw new AppError('VALIDATION_ERROR', `Order Status must be one of: ${ORDER_STATUSES.join(', ')}.`, {
      status: 400,
      details: [{ field: 'orderStatus', issue: 'invalid value' }],
    });
  }

  const comment = orderComment === null || orderComment === undefined ? '' : String(orderComment);
  const trimmed = comment.trim();
  if (trimmed.length > ORDER_COMMENT_MAX_LENGTH) {
    throw new AppError('VALIDATION_ERROR', `Order Comment must be ${ORDER_COMMENT_MAX_LENGTH} characters or fewer.`, {
      status: 400,
      details: [{ field: 'orderComment', issue: `max ${ORDER_COMMENT_MAX_LENGTH} characters` }],
    });
  }

  const before = await Order.findOne(
    { portal_order_ref: portalOrderRef },
    { order_status: 1, order_comment: 1 }
  ).lean();
  if (!before) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { order_status: orderStatus, order_comment: trimmed } },
    { new: true }
  );

  if (actor) {
    const fromStatus = before.order_status || '';
    const fromComment = before.order_comment || '';
    const statusChanged = fromStatus !== orderStatus;
    const commentChanged = fromComment !== trimmed;
    // The client's Save button always resubmits Order Status + Order Comment
    // together even when only one of them was actually edited — log only
    // what really changed, not a no-op resend of the untouched field.
    if (statusChanged || commentChanged) {
      let message;
      if (statusChanged && commentChanged) {
        message = `Order Status changed from "${fromStatus || '—'}" to "${orderStatus}" (comment updated)`;
      } else if (statusChanged) {
        message = fromStatus
          ? `Order Status changed from "${fromStatus}" to "${orderStatus}"`
          : `Order Status set to "${orderStatus}"`;
      } else {
        message = 'Order Comment updated';
      }
      await recordLog({
        portalOrderRef,
        actor,
        actorRole,
        action: 'order_status_set',
        message,
        details: { fromStatus, toStatus: orderStatus, fromComment, toComment: trimmed },
      });
    }
  }

  return toDto(doc);
}

// Set (or clear, with '') the order's Delivery Date (V4.2). Plain free text
// like order_date — no fixed format enforced, and no requirement (unlike
// Order Status). Editable at any time, independent of the initial save.
export async function setDeliveryDate(portalOrderRef, deliveryDate, { actor, actorRole } = {}) {
  const value = deliveryDate === null || deliveryDate === undefined ? '' : String(deliveryDate).trim();

  const before = await Order.findOne({ portal_order_ref: portalOrderRef }, { delivery_date: 1 }).lean();
  if (!before) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { delivery_date: value } },
    { new: true }
  );

  if (actor) {
    const fromValue = before.delivery_date || '';
    if (fromValue !== value) {
      const message = value ? `Delivery Date set to "${value}"` : 'Delivery Date cleared';
      await recordLog({
        portalOrderRef,
        actor,
        actorRole,
        action: 'delivery_date_set',
        message,
        details: { from: fromValue, to: value },
      });
    }
  }

  return toDto(doc);
}

// Discount Provided toggle — order-level, only meaningful for orders that
// actually classify into a discount bucket (see classifyDiscountBucket), but
// not restricted at the write layer: the four discount list pages are the
// only place the client ever calls this, so there's nothing to enforce here.
export async function setDiscountProvided(portalOrderRef, discountProvided, { actor, actorRole } = {}) {
  const value = Boolean(discountProvided);

  const before = await Order.findOne({ portal_order_ref: portalOrderRef }, { discount_provided: 1 }).lean();
  if (!before) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { discount_provided: value } },
    { new: true }
  );

  if (actor) {
    const fromValue = Boolean(before.discount_provided);
    if (fromValue !== value) {
      await recordLog({
        portalOrderRef,
        actor,
        actorRole,
        action: 'discount_provided_set',
        message: value ? 'Discount marked as provided' : 'Discount marked as not provided',
        details: { from: fromValue, to: value },
      });
    }
  }

  return toDto(doc);
}

// Lit Invoice toggle — order-level flag that relabels/recolours the Updated
// totals card on the client. Pure display state, no effect on any amount.
export async function setLitInvoice(portalOrderRef, litInvoice, { actor, actorRole } = {}) {
  const value = Boolean(litInvoice);

  const before = await Order.findOne({ portal_order_ref: portalOrderRef }, { lit_invoice: 1 }).lean();
  if (!before) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }

  const doc = await Order.findOneAndUpdate(
    { portal_order_ref: portalOrderRef },
    { $set: { lit_invoice: value } },
    { new: true }
  );

  if (actor) {
    const fromValue = Boolean(before.lit_invoice);
    if (fromValue !== value) {
      await recordLog({
        portalOrderRef,
        actor,
        actorRole,
        action: 'lit_invoice_set',
        message: value ? 'Marked as Lit Invoice' : 'Lit Invoice unmarked',
        details: { from: fromValue, to: value },
      });
    }
  }

  return toDto(doc);
}

// Update only the resolution snapshot (used after a product is approved) and
// recompute the derived order status.
export async function updateResolution(portalOrderRef, resolutionData, { actor, actorRole } = {}) {
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

  if (actor) {
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action: 'product_resolution_updated',
      message: 'Product match approved/updated',
      details: { resolutionStatus: resolution_status },
    });
  }

  return toDto(doc);
}

// The per-product Reason values selectable going forward (V3.2). 'Released'
// was removed from this set — that concept now belongs to the per-product
// Item Status (product_fulfillment.status) instead, to avoid two fields
// meaning the same thing. Existing orders with a stored 'Released' comment
// are NOT migrated or blocked: setProductComments only validates new writes,
// and the frontend's commentMeta() still renders the legacy value correctly
// wherever it's displayed — it just can't be chosen again from the dropdown.
// 'Not Found' (V2.1) marks matching as intentionally skipped for THIS order
// only — it is stored exactly like 'OS' and deliberately has NO effect
// anywhere else: it never creates an Approved Mapping, never touches the
// Product Catalog, and never influences the matching engine or future orders.
export const PRODUCT_COMMENTS = ['OS', 'Not Found'];

// Discount dashboard section (V4.7 — new, additive, read-only). An order is
// classified into exactly ONE of these buckets, derived live from its
// stored parsed_data — nothing new to write or backfill, so every past AND
// future order is covered automatically:
//   'sales_rep' — a discount row in parsed_data.financials.discounts (or the
//                 legacy singular discount/discount_label pair) whose label
//                 mentions "Sales Rep"
//   'rdd'       — same, but the label mentions "Range Density"/"RDD"
//   'both'      — an order with at least one discount row of EACH kind above
//   'other'     — no financials discount row of either kind, but the word
//                 "Discount" appears in the order's Additional Comment
// An order with none of the above simply doesn't belong to this section at
// all (matches no bucket) — see DISCOUNT_BUCKET_EXPR below.
export const DISCOUNT_BUCKETS = ['sales_rep', 'rdd', 'both', 'other'];

// Legacy comment value no longer selectable (see above) but still counted,
// alongside the Item Status 'delivered' value, toward the Dashboard's
// "Released" signal — see getDashboardSummary's released_by_processor facet.
const LEGACY_RELEASED_COMMENT = 'Released';

// Values setProductComments accepts on WRITE — a superset of the selectable
// PRODUCT_COMMENTS. The saved-order edit UI always resubmits every line's
// CURRENT comment on save, not just the ones the user actually changed, so
// an untouched legacy 'Released' line must still round-trip successfully
// (rejecting it would make it impossible to edit any other field on an
// order that has ANY 'Released' line — a real regression, not a feature).
// New selections still can't produce 'Released' since it's absent from the
// PRODUCT_COMMENTS the dropdown is built from.
const PRODUCT_COMMENTS_WRITE_ALLOWED = [...PRODUCT_COMMENTS, LEGACY_RELEASED_COMMENT];

// Merge per-product comments into an order without touching anything else.
// `comments` = { [lineId]: 'Released' | 'OS' | 'N/A' | 'Not Found' | null } —
// null/'' clears the comment for that line. Other lines' comments are preserved.
export async function setProductComments(portalOrderRef, comments, { actor, actorRole } = {}) {
  // The saved-order edit UI always resubmits every line's CURRENT comment on
  // save, not just the ones actually changed (see PRODUCT_COMMENTS_WRITE_ALLOWED's
  // comment above) — read the stored values first so the log only reports
  // lineIds whose value actually changes, not every line resent unchanged.
  const beforeDoc = await Order.findOne({ portal_order_ref: portalOrderRef }, { product_comments: 1 }).lean();
  const beforeComments = beforeDoc?.product_comments || {};

  const set = {};
  const unset = {};
  const changes = {};
  for (const [lineId, value] of Object.entries(comments || {})) {
    const key = `product_comments.${lineId}`;
    const before = beforeComments[lineId] || '';
    if (value === null || value === undefined || String(value).trim() === '') {
      unset[key] = '';
      if (before !== '') changes[lineId] = { from: before, to: '' };
    } else {
      if (!PRODUCT_COMMENTS_WRITE_ALLOWED.includes(value)) {
        throw new AppError('VALIDATION_ERROR', `Comment must be one of: ${PRODUCT_COMMENTS.join(', ')}.`, {
          status: 400,
          details: [{ field: `comments.${lineId}`, issue: 'invalid value' }],
        });
      }
      set[key] = value;
      if (before !== value) changes[lineId] = { from: before, to: value };
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

  if (actor && Object.keys(changes).length) {
    const lineIds = Object.keys(changes);
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action: 'product_comment_set',
      message: `Reason updated for ${lineIds.length} product(s)`,
      details: { lineIds, changes },
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
export async function setProductNotes(portalOrderRef, notes, { actor, actorRole } = {}) {
  // Mirrors setProductComments' before-read (V1.7's own doc comment above
  // notes on the edit UI resubmitting every line unchanged) — only changed
  // lineIds should ever reach the log.
  const beforeDoc = await Order.findOne({ portal_order_ref: portalOrderRef }, { product_notes: 1 }).lean();
  const beforeNotes = beforeDoc?.product_notes || {};

  const set = {};
  const unset = {};
  const changedLineIds = [];
  for (const [lineId, value] of Object.entries(notes || {})) {
    const key = `product_notes.${lineId}`;
    const before = beforeNotes[lineId] || '';
    if (value === null || value === undefined || String(value).trim() === '') {
      unset[key] = '';
      if (before !== '') changedLineIds.push(lineId);
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
      if (before !== trimmed) changedLineIds.push(lineId);
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

  if (actor && changedLineIds.length) {
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action: 'product_note_set',
      message: `Comments updated for ${changedLineIds.length} product(s)`,
      details: { lineIds: changedLineIds },
    });
  }

  return toDto(doc);
}

// Per-product delivery statuses (V1.4). Stored values; the client renders the
// display labels (Delivered / Half Delivered / Not Delivered).
export const DELIVERY_STATUSES = ['delivered', 'half_delivered', 'not_delivered'];

// Validate one line's fulfilment patch (V1.4; deliveredQty added V6.0). Pure
// — unit-testable, no DB. `patch` = { pendingQty?, status?, deliveredQty? };
// any field may be null/'' to clear it. `orderedQty` is the line's parsed
// quantity (pendingQty may never exceed it); a non-finite orderedQty skips
// the upper bound (line item missing/unparsable). deliveredQty is
// deliberately NOT bounded by orderedQty — see its block below.
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

  // Actual Delivered Qty (V6.0) — how many units of this line actually
  // arrived. Unlike pendingQty this has NO upper bound: a delivery is
  // usually short but can also come in over the ordered quantity, and both
  // need to be recordable, so `orderedQty` is deliberately not consulted
  // here. Still an integer >= 0.
  if ('deliveredQty' in patch) {
    const raw = patch.deliveredQty;
    if (raw === null || String(raw).trim() === '') {
      unset.push('deliveredQty');
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        throw new AppError('VALIDATION_ERROR', 'Actual delivered quantity must be an integer of 0 or more.', {
          status: 400,
          details: [{ field: `fulfillment.${lineId}.deliveredQty`, issue: 'must be an integer ≥ 0' }],
        });
      }
      set.deliveredQty = n;
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
// { [lineId]: { pendingQty?, status?, deliveredQty? } | null } — null removes
// the whole entry; a null/'' field inside a patch clears just that field.
// Other lines' entries are preserved.
export async function setProductFulfillment(portalOrderRef, fulfillment, { actor, actorRole } = {}) {
  const entries = Object.entries(fulfillment || {});
  if (!entries.length) {
    throw new AppError('VALIDATION_ERROR', 'No fulfillment entries provided.', {
      status: 400,
      details: [{ field: 'fulfillment', issue: 'required' }],
    });
  }

  // Ordered quantities come from the stored parsed line items (lineId is the
  // 1-based index into line_items) — the upper bound for pendingQty. Also
  // read product_fulfillment's current values (like setProductComments/
  // setProductNotes) so the log only reports lineIds whose Item Status /
  // Pending Qty actually change, not every line the edit UI resubmits as-is.
  const doc = await Order.findOne({ portal_order_ref: portalOrderRef }, { parsed_data: 1, product_fulfillment: 1 }).lean();
  if (!doc) {
    throw new AppError('NOT_FOUND', `No order found with Portal Order Ref "${portalOrderRef}".`, {
      status: 404,
    });
  }
  const items = Array.isArray(doc.parsed_data?.line_items) ? doc.parsed_data.line_items : [];
  const beforeFulfillment = doc.product_fulfillment || {};

  const set = {};
  const unset = {};
  const changedLineIds = [];
  for (const [lineId, patch] of entries) {
    const key = `product_fulfillment.${lineId}`;
    const beforeEntry = beforeFulfillment[lineId] || {};
    if (patch === null || patch === undefined) {
      unset[key] = '';
      if (
        beforeEntry.pendingQty !== undefined ||
        beforeEntry.status !== undefined ||
        beforeEntry.deliveredQty !== undefined
      ) changedLineIds.push(lineId);
      continue;
    }
    const orderedQty = Number(items[Number(lineId) - 1]?.qty);
    const validated = validateFulfillmentPatch(patch, orderedQty, lineId);
    let lineChanged = false;
    for (const [field, value] of Object.entries(validated.set)) {
      set[`${key}.${field}`] = value;
      if (beforeEntry[field] !== value) lineChanged = true;
    }
    for (const field of validated.unset) {
      unset[`${key}.${field}`] = '';
      if (beforeEntry[field] !== undefined) lineChanged = true;
    }
    if (lineChanged) changedLineIds.push(lineId);
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

  if (actor && changedLineIds.length) {
    await recordLog({
      portalOrderRef,
      actor,
      actorRole,
      action: 'product_fulfillment_set',
      message: `Item Status / Pending Qty / Delivered Qty updated for ${changedLineIds.length} product(s)`,
      details: { lineIds: changedLineIds },
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

// Plain-JS mirror of DISCOUNT_BUCKET_EXPR below — same rules, same
// precedence (both > sales_rep > rdd > other-via-comment > null). Needed
// because getOrder() reads one document directly with .lean() (no
// aggregation pipeline), so the Mongo-only expression can't be reused as-is.
// KEEP THESE TWO IN SYNC — any rule change belongs in both places.
export function classifyDiscountBucket(parsedData) {
  const discountsArr = parsedData?.financials?.discounts;
  let labels = [];
  if (Array.isArray(discountsArr) && discountsArr.length > 0) {
    labels = discountsArr.map((d) => String(d?.label || '').toLowerCase());
  } else if (parsedData?.financials?.discount) {
    labels = [String(parsedData.financials.discount_label || '').toLowerCase()];
  }
  const hasSalesRep = labels.some((l) => /sales\s*rep/i.test(l));
  const hasRdd = labels.some((l) => /range\s*density/i.test(l) || /\brdd\b/i.test(l));
  if (hasSalesRep && hasRdd) return 'both';
  if (hasSalesRep) return 'sales_rep';
  if (hasRdd) return 'rdd';
  const comments = String(parsedData?.order_info?.additional_comments || '').toLowerCase();
  if (/discount/i.test(comments)) return 'other';
  return null;
}

// Classifies one order into a DISCOUNT_BUCKETS value (or null). Self-
// contained ($let all the way down) so it works standalone inside the
// $project stage below regardless of same-stage field-reference quirks.
const DISCOUNT_BUCKET_EXPR = {
  $let: {
    vars: {
      // Every discount row's label, lower-cased. Prefers the `discounts`
      // array (every row an order has, V1.10); falls back to the legacy
      // singular discount/discount_label pair for older-shaped snapshots
      // that predate that array but still recorded exactly one discount.
      labels: {
        $let: {
          vars: { arr: { $ifNull: ['$parsed_data.financials.discounts', []] } },
          in: {
            $cond: [
              { $gt: [{ $size: '$$arr' }, 0] },
              { $map: { input: '$$arr', as: 'd', in: { $toLower: { $ifNull: ['$$d.label', ''] } } } },
              {
                $cond: [
                  { $ne: [{ $ifNull: ['$parsed_data.financials.discount', 0] }, 0] },
                  [{ $toLower: { $ifNull: ['$parsed_data.financials.discount_label', ''] } }],
                  [],
                ],
              },
            ],
          },
        },
      },
    },
    in: {
      $let: {
        vars: {
          hasSalesRep: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$$labels',
                    as: 'l',
                    cond: { $regexMatch: { input: '$$l', regex: 'sales\\s*rep', options: 'i' } },
                  },
                },
              },
              0,
            ],
          },
          hasRdd: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$$labels',
                    as: 'l',
                    cond: {
                      $or: [
                        { $regexMatch: { input: '$$l', regex: 'range\\s*density', options: 'i' } },
                        { $regexMatch: { input: '$$l', regex: '\\brdd\\b', options: 'i' } },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
        },
        in: {
          $switch: {
            branches: [
              { case: { $and: ['$$hasSalesRep', '$$hasRdd'] }, then: 'both' },
              { case: '$$hasSalesRep', then: 'sales_rep' },
              { case: '$$hasRdd', then: 'rdd' },
              {
                // 'other' (V4.7): no financials discount row of either kind,
                // but the word "Discount" appears in the Additional Comment.
                case: {
                  $regexMatch: {
                    input: { $toLower: { $ifNull: ['$parsed_data.order_info.additional_comments', ''] } },
                    regex: 'discount',
                    options: 'i',
                  },
                },
                then: 'other',
              },
            ],
            default: null,
          },
        },
      },
    },
  },
};

// Shared first stage: strip each order to the summary fields the dashboard
// cards need, plus flat arrays of its products' delivery statuses / comments.
// parsed_data / resolution_data are dropped immediately so the heavy blobs
// never flow through the pipeline (or over the wire).
const DASHBOARD_FIELDS_STAGE = {
  $project: {
    portal_order_ref: 1,
    customer_name: 1,
    processed_by: 1,
    processed_by_original: 1,
    order_date: 1,
    upload_timestamp: 1,
    total_products: 1,
    resolution_status: 1,
    delivery_statuses: { $map: { input: mapEntries('product_fulfillment'), as: 'e', in: '$$e.v.status' } },
    comment_values: { $map: { input: mapEntries('product_comments'), as: 'e', in: '$$e.v' } },
    // Fulfillment/comment entry arrays kept for item-level counting (V4 dashboard).
    _fulfillment_entries: mapEntries('product_fulfillment'),
    _comment_entries: mapEntries('product_comments'),
    // Direct scalar field (not a per-line map). No 'Unknown' fallback here
    // (V3.3) — an order with no status set simply matches none of the
    // dashboard's order-status buckets until it actually has one.
    order_status: 1,
    // Free-text order-level comment (V3.2) — projected for the Order
    // Comments dashboard section (V3.4), which matches on non-empty text
    // rather than a fixed value like the buckets above.
    order_comment: 1,
    // Order Channel (V3.5) — 'Orders - Email' | 'Order - Kumkum'.
    order_channel: 1,
    // Discount dashboard section (V4.7) — see DISCOUNT_BUCKET_EXPR above.
    discount_bucket: DISCOUNT_BUCKET_EXPR,
    // Discount Provided toggle — plain stored field, not derived.
    discount_provided: 1,
    // Delivery date (V4 dashboard). Prefers the top-level field (V4.2,
    // directly editable) when it's actually set; falls back to the legacy
    // Manual Order Creation location for orders saved before that field
    // existed. NOTE: can't use a plain $ifNull chain here — the schema
    // default makes delivery_date '' (present, not null) on every order that
    // has never had one set, which would short-circuit $ifNull before ever
    // reaching the fallback.
    delivery_date: {
      $cond: [
        { $and: [{ $ne: ['$delivery_date', null] }, { $ne: ['$delivery_date', ''] }] },
        '$delivery_date',
        { $ifNull: ['$parsed_data.order_info.delivery_date', ''] },
      ],
    },
    // Resolution results — projected only for unique-item counting; the
    // heavy per-candidate arrays are NOT included (only match.itemNo).
    _resolution_item_nos: {
      $map: {
        input: {
          $cond: [
            { $isArray: '$resolution_data.results' },
            '$resolution_data.results',
            [],
          ],
        },
        as: 'r',
        in: '$$r.match.itemNo',
      },
    },
  },
};

// Presence check for the Order Comments dashboard section (V3.4) — an order
// belongs here when it has a real, non-empty Order Comment. Unlike the
// buckets above (fixed enum value equality) this matches on non-emptiness,
// so it isn't expressed through the bucket()/DASHBOARD_ORDER_STATUSES
// machinery.
const HAS_ORDER_COMMENT_MATCH = { order_comment: { $exists: true, $ne: '' } };

// Presence check for the "Half Released" dashboard row (V5.9) — an
// order belongs here when AT LEAST ONE of its products carries a Reason of
// 'OS' or 'Not Found'. Deliberately an order-level count, not an item-level
// one: the Item card's OS / Not Found rows count individual products (an
// order with 3 OS lines adds 3 there), whereas this counts the ORDER once no
// matter how many flagged lines it has, and once — not twice — when it has
// both an OS line and a Not Found line. $in over the denormalized
// comment_values array gives exactly that de-duplication for free, since a
// document either matches the array predicate or it doesn't.
const HAS_ITEM_ISSUE_MATCH = { comment_values: { $in: PRODUCT_COMMENTS } };

// Order Status dashboard buckets (V3.2; 'Unknown' bucket removed V3.3).
const DASHBOARD_ORDER_STATUSES = ORDER_STATUSES;

// Map a dashboard-projected document to the card DTO. Deliberately lean —
// exactly what an order card renders (ref, customer, processed by, date).
function toDashboardCardDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    customerName: doc.customer_name || '',
    processedBy: doc.processed_by || '',
    processedByOriginal: doc.processed_by_original || '',
    orderDate: doc.order_date || '',
    uploadTimestamp:
      doc.upload_timestamp instanceof Date ? doc.upload_timestamp.toISOString() : doc.upload_timestamp,
    totalProducts: doc.total_products ?? 0,
    resolutionStatus: doc.resolution_status || 'needs_review',
    // Only meaningful for the Order Comments section (V3.4); harmless '' on
    // every other card, which never reads this field.
    orderComment: doc.order_comment || '',
    // Delivery date from the parsed email (V4 dashboard).
    deliveryDate: doc.delivery_date || '',
    // Discount Provided toggle — only rendered on the discount list pages,
    // but harmless to include on every card.
    discountProvided: Boolean(doc.discount_provided),
    // Overall Order Status — shown as a column on the View-All list pages.
    // '' when not set yet (client renders a dash).
    orderStatus: doc.order_status || '',
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
  const processedByUsers = await getProcessedByUsers();

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
  DASHBOARD_ORDER_STATUSES.forEach((status, i) => bucket(`os${i}`, 'order_status', status));
  DISCOUNT_BUCKETS.forEach((value, i) => bucket(`disc${i}`, 'discount_bucket', value));

  // Order Comments section (V3.4) — a single bucket keyed on presence of a
  // non-empty order_comment, not a fixed value, so it can't go through the
  // bucket() helper above.
  facets.ocm_orders = [{ $match: HAS_ORDER_COMMENT_MATCH }, { $sort: { upload_timestamp: -1 } }, { $limit: limit }];
  facets.ocm_count = [{ $match: HAS_ORDER_COMMENT_MATCH }, { $count: 'n' }];

  // Half Released section (V5.9) — same single-bucket shape as the
  // Order Comments section above, keyed on HAS_ITEM_ISSUE_MATCH.
  facets.iss_orders = [{ $match: HAS_ITEM_ISSUE_MATCH }, { $sort: { upload_timestamp: -1 } }, { $limit: limit }];
  facets.iss_count = [{ $match: HAS_ITEM_ISSUE_MATCH }, { $count: 'n' }];

  // Overview stats — total orders, orders uploaded today, and Released orders
  // broken down by processor — power the three summary cards atop the page.
  facets.total_count = [{ $count: 'n' }];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  facets.today_count = [{ $match: { upload_timestamp: { $gte: startOfToday } } }, { $count: 'n' }];
  // 'Released' signal (V3.2): union of the legacy per-product comment value
  // and the current Item Status 'delivered' value (product_fulfillment.status
  // — displayed as "Released"), since Reason can no longer produce 'Released'
  // for new orders. Historical orders keep counting via either signal; future
  // orders count via the delivery-status signal only.
  facets.released_by_processor = [
    { $match: { $or: [{ comment_values: LEGACY_RELEASED_COMMENT }, { delivery_statuses: 'delivered' }] } },
    { $group: { _id: '$processed_by', n: { $sum: 1 } } },
  ];

  // ── V4 dashboard facets ──────────────────────────────────────────────

  // Channel counts — 'Orders - Email' / 'Order - Kumkum' (V3.5 field).
  facets.channel_counts = [
    { $group: { _id: '$order_channel', n: { $sum: 1 } } },
  ];

  // Total items = sum of total_products across all orders.
  facets.total_items = [
    { $group: { _id: null, n: { $sum: '$total_products' } } },
  ];

  // Unique items = distinct matched item numbers from resolution results.
  facets.unique_items = [
    { $unwind: '$_resolution_item_nos' },
    { $match: { _resolution_item_nos: { $ne: null } } },
    { $group: { _id: '$_resolution_item_nos' } },
    { $count: 'n' },
  ];

  // Item-level status counts — flatten product_fulfillment entries and
  // count each status value (delivered/half_delivered/not_delivered).
  facets.item_status_counts = [
    { $unwind: '$_fulfillment_entries' },
    { $match: { '_fulfillment_entries.v.status': { $in: DELIVERY_STATUSES } } },
    { $group: { _id: '$_fulfillment_entries.v.status', n: { $sum: 1 } } },
  ];

  // Item-level reason counts — flatten product_comments entries and count
  // each reason value (OS / Not Found).
  facets.item_reason_counts = [
    { $unwind: '$_comment_entries' },
    { $match: { '_comment_entries.v': { $in: PRODUCT_COMMENTS } } },
    { $group: { _id: '$_comment_entries.v', n: { $sum: 1 } } },
  ];

  // Delivery dates — group by delivery_date, count orders per date. Feeds
  // the "next 7 delivery dates" card and the "all upcoming delivery dates"
  // View All list (both computed from this in JS below, since day-difference
  // math needs an actual parsed date, not the raw grouped string). No
  // per-date order preview is pushed here — nothing reads it (card/View All
  // only ever show date + count, and clicking through re-queries
  // listDashboardOrders for that one date) — and capping at a generous 2000
  // distinct date-strings is just a defensive ceiling against dirty data,
  // not a real display limit.
  facets.delivery_dates = [
    // NOTE: was written as { $ne: '', $ne: null } — a JS object literal with
    // a duplicate key, so the first $ne silently lost to the second and
    // empty-string delivery dates were never actually excluded. $nin fixes
    // it without the duplicate-key trap.
    { $match: { delivery_date: { $exists: true, $nin: ['', null] } } },
    { $group: { _id: '$delivery_date', count: { $sum: 1 } } },
    { $limit: 2000 },
  ];

  // Today's orders by processor — same startOfToday, grouped by processed_by.
  facets.today_by_processor = [
    { $match: { upload_timestamp: { $gte: startOfToday } } },
    { $group: { _id: '$processed_by', n: { $sum: 1 } } },
  ];

  // All orders by processor — for the Employee section.
  facets.all_by_processor = [
    { $group: { _id: '$processed_by', n: { $sum: 1 } } },
  ];

  // Today's orders preview (latest 5 for the card).
  facets.today_orders_preview = [
    { $match: { upload_timestamp: { $gte: startOfToday } } },
    { $sort: { upload_timestamp: -1 } },
    { $limit: limit },
  ];

  // Last 7 days' daily order counts (incl. today) — powers the Today's
  // Orders card's trend sparkline. Real data, not decorative: grouped by
  // calendar day on upload_timestamp.
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  facets.last_7_days = [
    { $match: { upload_timestamp: { $gte: sevenDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$upload_timestamp' } }, n: { $sum: 1 } } },
  ];

  const [agg] = await Order.aggregate([DASHBOARD_FIELDS_STAGE, { $facet: facets }]);

  const readBucket = (key, value) => ({
    value,
    total: agg[`${key}_count`]?.[0]?.n ?? 0,
    orders: (agg[`${key}_orders`] || []).map(toDashboardCardDto),
  });

  // Seeded with the known staff list so they always show (even at 0), but
  // NOT restricted to it — any real processed_by value in the data counts
  // (e.g. 'Dev Team'), so the breakdown reflects who actually processed
  // orders rather than silently dropping anyone outside a fixed allowlist.
  const releasedByProcessor = {};
  for (const user of processedByUsers) releasedByProcessor[user] = 0;
  for (const row of agg.released_by_processor || []) {
    if (row._id) releasedByProcessor[row._id] = row.n;
  }

  // ── V4 — assemble new dashboard fields ──────────────────────────────

  // Channel counts
  const channelCounts = {};
  for (const ch of ORDER_CHANNELS) channelCounts[ch] = 0;
  for (const row of agg.channel_counts || []) {
    if (row._id && row._id in channelCounts) channelCounts[row._id] = row.n;
  }

  // Item-level status counts
  const itemStatusCounts = {};
  for (const s of DELIVERY_STATUSES) itemStatusCounts[s] = 0;
  for (const row of agg.item_status_counts || []) {
    if (row._id in itemStatusCounts) itemStatusCounts[row._id] = row.n;
  }

  // Item-level reason counts
  const itemReasonCounts = {};
  for (const c of PRODUCT_COMMENTS) itemReasonCounts[c] = 0;
  for (const row of agg.item_reason_counts || []) {
    if (row._id in itemReasonCounts) itemReasonCounts[row._id] = row.n;
  }

  // Delivery dates — Order Delivery Date section (V4, revised). Every group
  // with an unparseable date string (legacy free text that never matched
  // DD/MM/YYYY or ISO) is dropped: there's no way to compute a day
  // difference for it, so it can't appear as "upcoming" either way. Once a
  // date is edited through the calendar-driven input it becomes parseable,
  // so this heals itself over time rather than needing a data migration.
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const parsedDeliveryDates = (agg.delivery_dates || [])
    .map((g) => {
      const parsed = parseFlexibleDate(g._id);
      return parsed ? { date: g._id, count: g.count, daysUntil: daysBetween(parsed, todayMidnight) } : null;
    })
    .filter(Boolean);

  // Upcoming = today or later, soonest first — the full set, for the
  // Delivery Date "View All" list.
  const upcomingDeliveryDates = parsedDeliveryDates
    .filter((d) => d.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Crossed = strictly before today, most recent first — the full set, for
  // the Delivery Date "View All" list's Crossed section and the dashboard's
  // "latest crossed" card.
  const crossedDeliveryDates = parsedDeliveryDates
    .filter((d) => d.daysUntil < 0)
    .sort((a, b) => b.daysUntil - a.daysUntil);

  // The next 7 DATES THAT HAVE ORDERS (not a 7-calendar-day window — a gap
  // of no-order days no longer shrinks the card below 7 rows when there are
  // more upcoming dates further out to fill it). Dates with no orders never
  // entered parsedDeliveryDates in the first place (the aggregation only
  // groups dates that have >=1 order), so empty days are already skipped.
  const next7DeliveryDates = upcomingDeliveryDates.slice(0, 7);

  // Latest 7 crossed (past) delivery dates, most recent first — mirrors
  // next7DeliveryDates for the dashboard's "Crossed Delivery Dates" card.
  const next7CrossedDeliveryDates = crossedDeliveryDates.slice(0, 7);

  // Today by processor — dynamic (see releasedByProcessor above): seeded
  // with the known staff, but any real processed_by value counts.
  const todayByProcessor = {};
  for (const user of processedByUsers) todayByProcessor[user] = 0;
  for (const row of agg.today_by_processor || []) {
    if (row._id) todayByProcessor[row._id] = row.n;
  }

  // All orders by processor (Employee section) — dynamic, same as above.
  const allByProcessor = {};
  for (const user of processedByUsers) allByProcessor[user] = 0;
  for (const row of agg.all_by_processor || []) {
    if (row._id) allByProcessor[row._id] = row.n;
  }

  // Last 7 days — fill every day (including zero-order days) so the
  // sparkline always has exactly 7 points in chronological order.
  const byDay = new Map((agg.last_7_days || []).map((row) => [row._id, row.n]));
  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7Days.push({ date: key, count: byDay.get(key) || 0 });
  }

  return {
    previewLimit: limit,
    totalOrders: agg.total_count?.[0]?.n ?? 0,
    todayOrders: agg.today_count?.[0]?.n ?? 0,
    releasedByProcessor,
    statuses: DELIVERY_STATUSES.map((status, i) => readBucket(`s${i}`, status)),
    comments: PRODUCT_COMMENTS.map((comment, i) => readBucket(`c${i}`, comment)),
    orderStatuses: DASHBOARD_ORDER_STATUSES.map((status, i) => readBucket(`os${i}`, status)),
    // Discount section (V4.7) — see DISCOUNT_BUCKETS/DISCOUNT_BUCKET_EXPR.
    discountBuckets: DISCOUNT_BUCKETS.map((value, i) => readBucket(`disc${i}`, value)),
    // Single bucket, not one per DASHBOARD_ORDER_STATUSES-style value —
    // "has an Order Comment" is the only state this section tracks.
    orderComments: readBucket('ocm', 'has'),
    // Orders with at least one OS / Not Found product (V5.9). Counted per
    // ORDER and de-duplicated — see HAS_ITEM_ISSUE_MATCH. Same single-bucket
    // shape as orderComments above.
    orderIssues: readBucket('iss', 'has'),
    // V4 dashboard additions
    channelCounts,
    totalItems: agg.total_items?.[0]?.n ?? 0,
    uniqueItems: agg.unique_items?.[0]?.n ?? 0,
    itemStatusCounts,
    itemReasonCounts,
    // Order Delivery Date section (V4, revised; V5.3 — added crossed dates):
    // next7DeliveryDates powers the dashboard card (the next 7 dates that
    // actually have orders, today included, no-order days skipped
    // automatically), upcomingDeliveryDates powers "View All"'s Upcoming
    // section (every upcoming date, unbounded). next7CrossedDeliveryDates
    // powers the dashboard's Crossed Delivery Dates card (latest 7 past
    // dates), crossedDeliveryDates powers "View All"'s Crossed section
    // (every past date, unbounded). Each entry: { date, count, daysUntil }
    // (daysUntil is negative for crossed dates).
    next7DeliveryDates,
    upcomingDeliveryDates,
    next7CrossedDeliveryDates,
    crossedDeliveryDates,
    todayByProcessor,
    allByProcessor,
    todayOrdersPreview: (agg.today_orders_preview || []).map(toDashboardCardDto),
    last7Days,
  };
}

// Full dataset for the "Export Dashboard" workbook (V4.8, read-only). One
// aggregation pass fetches every order with exactly what every sheet needs —
// order-level fields, the discount bucket (same DISCOUNT_BUCKET_EXPR the
// dashboard/View-All use, so the workbook can never disagree with what's on
// screen), and the raw line items + per-line comments/fulfillment/resolution
// match so the "All Items"/"Unique Items" sheets can be built without a
// second query. Deliberately NOT paginated — a full report needs every order,
// and 500-600 orders is small enough to hold in memory once.
export async function getDashboardExportOrders() {
  const docs = await Order.aggregate([
    {
      $project: {
        portal_order_ref: 1,
        customer_name: 1,
        processed_by: 1,
        order_date: 1,
        order_status: 1,
        order_channel: 1,
        order_comment: 1,
        total_products: 1,
        delivery_date: {
          $cond: [
            { $and: [{ $ne: ['$delivery_date', null] }, { $ne: ['$delivery_date', ''] }] },
            '$delivery_date',
            { $ifNull: ['$parsed_data.order_info.delivery_date', ''] },
          ],
        },
        discount_bucket: DISCOUNT_BUCKET_EXPR,
        line_items: { $ifNull: ['$parsed_data.line_items', []] },
        product_comments: { $ifNull: ['$product_comments', {}] },
        product_fulfillment: { $ifNull: ['$product_fulfillment', {}] },
        product_notes: { $ifNull: ['$product_notes', {}] },
        resolution_results: { $ifNull: ['$resolution_data.results', []] },
      },
    },
  ]);

  // Numeric refs sort naturally (100 after 99); non-numeric ones (the
  // "KS-..." Kumkum refs) sort alphabetically after every numeric one.
  docs.sort((a, b) => {
    const na = Number(a.portal_order_ref);
    const nb = Number(b.portal_order_ref);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (Number.isFinite(na)) return -1;
    if (Number.isFinite(nb)) return 1;
    return String(a.portal_order_ref).localeCompare(String(b.portal_order_ref));
  });

  return docs;
}

// OS Pending by Item (Dashboard "Item" card — new, additive). For every
// order line whose Reason is 'OS' (out of stock), attributes its pending
// quantity to the line's resolved item number and sums across every order.
// Reuses getDashboardExportOrders()'s single unfiltered fetch (same fields
// dashboardWorkbook.js's "Unique Items" sheet already reduces the same way)
// rather than a second query — this app's order volume is small enough that
// one extra JS pass over already-fetched data is cheaper than a second
// round trip to Mongo.
//
// Pending quantity per line: the user-entered product_fulfillment.pendingQty
// ONLY when it's a real positive number; otherwise (never entered, blank, or
// explicitly 0) the FULL originally-ordered quantity (parsed_data.line_items[].qty).
// Reason ('OS') and Item Status/Pending Qty are independent fields elsewhere
// in this app, so a line can be flagged OS while Pending Qty was left blank
// or zeroed out without anyone actually tracking delivery against it — since
// the product is out of stock, the whole line is still effectively
// outstanding unless a smaller pending amount was deliberately entered.
//
// A line only counts if it resolved to a real item number (match.itemNo, or
// suggestedProduct.itemNo for a still-unapproved line) — an OS line with no
// resolved product at all can't be attributed to any item and is skipped.
//
// `dateFrom`/`dateTo` (both optional, 'YYYY-MM-DD' from a plain <input
// type="date">) restrict this to orders whose Order Date falls in that
// range (inclusive). Order Date is a free-text field (see order.model.js),
// parsed with the same parseFlexibleDate() every other date filter in this
// file already uses — an order whose date can't be confidently parsed is
// excluded when a range is active, same as the Delivery Date sections do.
export async function getOsPendingByItem({ dateFrom, dateTo } = {}) {
  const orders = await getDashboardExportOrders();

  const fromDate = dateFrom ? parseFlexibleDate(dateFrom) : null;
  const toDate = dateTo ? parseFlexibleDate(dateTo) : null;

  const itemMap = new Map(); // itemNo -> { itemNo, productName, totalPendingQty, orders: [] }

  for (const order of orders) {
    if (fromDate || toDate) {
      const orderDate = parseFlexibleDate(order.order_date);
      if (!orderDate) continue;
      if (fromDate && orderDate < fromDate) continue;
      if (toDate && orderDate > toDate) continue;
    }

    const comments = order.product_comments || {};
    const fulfillment = order.product_fulfillment || {};
    const items = order.line_items || [];

    for (const result of order.resolution_results || []) {
      const lineId = result.lineId;
      if (comments[lineId] !== 'OS') continue;

      const matched = result.match || result.suggestedProduct;
      const itemNo = matched?.itemNo;
      if (!itemNo) continue;

      const lineIndex = Number(String(lineId).split('-').pop()) - 1;
      const item = items[lineIndex];

      const enteredPendingQty = Number(fulfillment[lineId]?.pendingQty);
      const pendingQty = Number.isFinite(enteredPendingQty) && enteredPendingQty > 0
        ? enteredPendingQty
        : Number(item?.qty) || 0;
      if (pendingQty <= 0) continue;

      const productName = matched?.websiteProductName || item?.description || '';

      let entry = itemMap.get(itemNo);
      if (!entry) {
        entry = { itemNo, productName, totalPendingQty: 0, orders: [] };
        itemMap.set(itemNo, entry);
      }
      entry.totalPendingQty += pendingQty;
      entry.orders.push({
        portalOrderRef: order.portal_order_ref,
        customerName: order.customer_name || '',
        pendingQty,
      });
    }
  }

  return Array.from(itemMap.values()).sort((a, b) => b.totalPendingQty - a.totalPendingQty);
}

// Full filtered list for a single dashboard bucket ("View All"), paginated.
// `type` = 'status' | 'comment' | 'orderStatus' | 'orderComment' |
// 'deliveryDate' | 'today' | 'todayProcessor' | 'allOrders' | 'processor'
// (V4 dashboard additions); `value` is validated against the platform's
// known values so the match can never be driven by arbitrary input.
// Column -> computed sort key for the "View All" list (V4.1). portal_order_ref
// is a numeric-looking String, so a plain string sort would put "100" before
// "99" — converted to a number instead. customer/processedBy are
// lower-cased so sort order isn't case-sensitive. 'orderDate' sorts by the
// actual order_date value shown in that column (DD/MM/YYYY, verified
// consistent across all 472 existing orders), rearranged to YYYYMMDD so it
// sorts chronologically instead of lexicographically (a plain string sort
// would put "22/06/2026" before "16/08/2026"). Malformed/blank values (not
// currently present, but not schema-guaranteed) sort to the front in
// ascending order rather than crashing the aggregation.
const ORDER_DATE_SORT_KEY = {
  $let: {
    vars: { d: { $ifNull: ['$order_date', ''] } },
    in: {
      $cond: [
        { $eq: [{ $strLenCP: '$$d' }, 10] },
        { $concat: [{ $substrCP: ['$$d', 6, 4] }, { $substrCP: ['$$d', 3, 2] }, { $substrCP: ['$$d', 0, 2] }] },
        '',
      ],
    },
  },
};
const SORT_KEY_EXPR = {
  ref: { $convert: { input: '$portal_order_ref', to: 'int', onError: 0, onNull: 0 } },
  customer: { $toLower: { $ifNull: ['$customer_name', ''] } },
  processedBy: { $toLower: { $ifNull: ['$processed_by', ''] } },
  orderStatus: { $toLower: { $ifNull: ['$order_status', ''] } },
  orderDate: ORDER_DATE_SORT_KEY,
  products: { $ifNull: ['$total_products', 0] },
};

export async function listDashboardOrders({ type, value, page, limit, sortBy, sortDir } = {}) {
  // Security: `type`/`value` come straight from req.query, and Express's
  // default query parser turns bracket-notation like `?value[$ne]=` into a
  // nested OBJECT ({ $ne: '' }), not a string. Every branch below either
  // puts `value` directly into a Mongo $match object or compares it against
  // a whitelist — an unstripped object would let a caller inject arbitrary
  // Mongo operators into the filter (confirmed exploitable: it bypassed the
  // deliveryDate filter entirely and matched hundreds of unrelated orders).
  // Forcing both to plain strings up front closes that for every branch at
  // once, since a legitimate type/value is never anything but a string.
  type = type === undefined || type === null ? '' : String(type);
  value = value === undefined || value === null ? '' : String(value);

  const pageN = clampInt(page, 1, 1, 100000);
  const limitN = clampInt(limit, 25, 1, 100);
  const sortKeyExpr = SORT_KEY_EXPR[sortBy];
  const dir = sortDir === 'asc' ? 1 : -1;

  let matchStage;
  if (type === 'orderComment') {
    if (value !== 'has') {
      throw new AppError('VALIDATION_ERROR', "value must be 'has'.", {
        status: 400,
        details: [{ field: 'value', issue: 'invalid value' }],
      });
    }
    matchStage = HAS_ORDER_COMMENT_MATCH;
  } else if (type === 'orderIssue') {
    if (value !== 'has') {
      throw new AppError('VALIDATION_ERROR', "value must be 'has'.", {
        status: 400,
        details: [{ field: 'value', issue: 'invalid value' }],
      });
    }
    matchStage = HAS_ITEM_ISSUE_MATCH;
  } else if (type === 'deliveryDate') {
    // Filter by a specific delivery date string.
    if (!value) {
      throw new AppError('VALIDATION_ERROR', 'value (delivery date) is required.', {
        status: 400,
        details: [{ field: 'value', issue: 'required' }],
      });
    }
    matchStage = { delivery_date: value };
  } else if (type === 'today') {
    const sot = new Date(); sot.setHours(0, 0, 0, 0);
    matchStage = { upload_timestamp: { $gte: sot } };
  } else if (type === 'todayProcessor') {
    if (!value) {
      throw new AppError('VALIDATION_ERROR', 'value (processor name) is required.', {
        status: 400,
        details: [{ field: 'value', issue: 'required' }],
      });
    }
    const sot = new Date(); sot.setHours(0, 0, 0, 0);
    matchStage = { upload_timestamp: { $gte: sot }, processed_by: value };
  } else if (type === 'allOrders') {
    matchStage = {}; // no filter — all orders
  } else if (type === 'processor') {
    if (!value) {
      throw new AppError('VALIDATION_ERROR', 'value (processor name) is required.', {
        status: 400,
        details: [{ field: 'value', issue: 'required' }],
      });
    }
    matchStage = { processed_by: value };
  } else if (type === 'processorOriginal') {
    // Admin Portal's Deleted Employees section — orders this (now-deleted)
    // employee originally processed, before Delete reassigned them to Chat
    // Team (see Order.processed_by_original's schema comment).
    if (!value) {
      throw new AppError('VALIDATION_ERROR', 'value (processor name) is required.', {
        status: 400,
        details: [{ field: 'value', issue: 'required' }],
      });
    }
    matchStage = { processed_by_original: value };
  } else {
    const known = {
      status: DELIVERY_STATUSES,
      comment: PRODUCT_COMMENTS,
      orderStatus: DASHBOARD_ORDER_STATUSES,
      discount: DISCOUNT_BUCKETS,
      channel: ORDER_CHANNELS,
    };
    const allowed = known[type];
    if (!allowed) {
      throw new AppError('VALIDATION_ERROR', "type must be 'status', 'comment', 'orderStatus', 'orderComment', 'orderIssue', 'discount', 'channel', 'deliveryDate', 'today', 'todayProcessor', 'allOrders', 'processor', or 'processorOriginal'.", {
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
    const matchField =
      type === 'status'
        ? 'delivery_statuses'
        : type === 'comment'
          ? 'comment_values'
          : type === 'discount'
            ? 'discount_bucket'
            : type === 'channel'
              ? 'order_channel'
              : 'order_status';
    matchStage = { [matchField]: value };
  }

  const pipeline = [DASHBOARD_FIELDS_STAGE, { $match: matchStage }];
  if (sortKeyExpr) {
    // Unrecognized sortBy falls through to the default below rather than
    // erroring — sorting is a display nicety, not something a bad/unknown
    // query param should ever 400 on.
    pipeline.push({ $addFields: { _sortKey: sortKeyExpr } }, { $sort: { _sortKey: dir, upload_timestamp: -1 } });
  } else {
    pipeline.push({ $sort: { upload_timestamp: -1 } });
  }
  pipeline.push({
    $facet: {
      data: [{ $skip: (pageN - 1) * limitN }, { $limit: limitN }],
      count: [{ $count: 'n' }],
    },
  });

  const [agg] = await Order.aggregate(pipeline);

  const total = agg?.count?.[0]?.n ?? 0;
  return {
    data: (agg?.data || []).map(toDashboardCardDto),
    meta: { type, value, total, page: pageN, limit: limitN, pages: Math.max(1, Math.ceil(total / limitN)), sortBy: sortKeyExpr ? sortBy : null, sortDir: sortKeyExpr ? (dir === 1 ? 'asc' : 'desc') : null },
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
