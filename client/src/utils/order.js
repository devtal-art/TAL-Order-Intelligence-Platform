// Order-layer helpers (V1.2). Pure functions shared by hooks and UI so the
// client and server agree on how an order's status is derived and identified.

// Resolve the Portal Order Ref No for an order. Falls back to a filename-based
// synthetic key when the email had no ref, so the order can still be stored and
// re-uploads of the same file remain idempotent.
export function portalOrderRef(parsedData, filename = '') {
  const ref = String(parsedData?.order_info?.order_ref || '').trim();
  if (ref) return ref;
  const base = String(filename || 'order').replace(/\.html?$/i, '').trim() || 'order';
  return `NOREF-${base}`;
}

// Whether an order used a real Portal Order Ref (vs. the NOREF- fallback).
export function hasRealRef(parsedData) {
  return String(parsedData?.order_info?.order_ref || '').trim().length > 0;
}

// Derive an order's status from its products' resolution results.
//   'resolved' | 'partially_resolved' | 'needs_review'
export function deriveOrderStatus(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return 'needs_review';
  const approved = list.filter((r) => r && r.status === 'approved').length;
  if (approved === 0) return 'needs_review';
  if (approved === list.length) return 'resolved';
  return 'partially_resolved';
}

// Team members who can be assigned as an order's processor (V1.9). Order-level
// identification only — deliberately NOT authentication or user management.
export const PROCESSED_BY_USERS = ['Jasmeet', 'Shubham', 'Alpa', 'Sahil', 'Sehbaz', 'Shashwat', 'Gagandeep'];

// The per-product Reason values selectable going forward (V3.2).
//   'OS'        — out of stock
//   'Not Found' — product doesn't exist in our records and matching is
//                 INTENTIONALLY skipped for THIS order only (V2.1). Never
//                 creates a mapping and never affects future orders — it is
//                 stored exactly like 'OS' (product_comments).
// 'Released' was removed from this list — that concept now belongs to Item
// Status (DELIVERY_STATUSES below) instead, so the two fields don't overlap.
// Legacy orders that already have a stored 'Released' comment still display
// it correctly via commentMeta() below; it just can't be re-selected.
export const PRODUCT_COMMENTS = ['OS', 'Not Found'];

// The comment value that intentionally skips matching for the order (V2.1).
export const NOT_FOUND_COMMENT = 'Not Found';

// Whether a product's comment marks matching as intentionally skipped for
// this order (V2.1). Purely order-level: drives the disabled state of the
// matching controls (Search / Approve / product selection) and the Save gate
// — it never touches the matching engine or Approved Mappings.
export function isMatchingSkipped(comment) {
  return comment === NOT_FOUND_COMMENT;
}

// Human label + style token for a product comment (badge rendering).
export function commentMeta(comment) {
  switch (comment) {
    case 'Released':
      return { label: 'Released', tone: 'released' };
    case 'OS':
      return { label: 'OS', tone: 'os' };
    case 'N/A':
      // Legacy value — still renderable if stored, but no longer offered in the dropdown.
      return { label: 'N/A', tone: 'na' };
    case 'Not Found':
      // Neutral (grey) — an order-level decision, not an inventory status.
      return { label: 'Not Found', tone: 'notfound' };
    default:
      return null;
  }
}

// Per-product Item Status (V1.4, relabeled V3.2): stored value + display
// label. Stored values (delivered/half_delivered/not_delivered) are
// UNCHANGED for backward compatibility — only the display labels changed,
// from Delivered/Half Delivered/Not Delivered to Released/Half Released/Not
// Released, to match the renamed "Item Status" column.
export const DELIVERY_STATUSES = [
  { value: 'delivered', label: 'Released' },
  { value: 'half_delivered', label: 'Half Released' },
  { value: 'not_delivered', label: 'Not Released' },
];

// Human label + style token for an Item Status (badge rendering).
//   delivered → green, half_delivered → yellow, not_delivered → red.
export function deliveryMeta(status) {
  switch (status) {
    case 'delivered':
      return { label: 'Released', tone: 'delivered' };
    case 'half_delivered':
      return { label: 'Half Released', tone: 'half' };
    case 'not_delivered':
      return { label: 'Not Released', tone: 'not' };
    default:
      return null;
  }
}

// Overall Order Status (V3.2; extended V3.3) — distinct from the per-product
// Item Status above. 'Unknown' removed V3.3 — every order now carries a
// real value from this list. 'Order Comments' removed V3.4 — it collided
// with the free-text Order Comment field and is superseded by the
// dashboard's dedicated Order Comments section (driven by non-empty
// order_comment, not by this status enum). No stored order ever used this
// value, so no display fallback is needed for it.
export const ORDER_STATUSES = [
  'Order Released',
  'Order Hold',
  'Order Cancelled',
  'Order Released but Problem',
];

// Human label + style token for the overall Order Status (badge rendering).
export function orderStatusMeta(status) {
  switch (status) {
    case 'Order Released':
      return { label: 'Order Released', tone: 'released' };
    case 'Order Hold':
      return { label: 'Order Hold', tone: 'hold' };
    case 'Order Cancelled':
      return { label: 'Order Cancelled', tone: 'cancelled' };
    case 'Order Released but Problem':
      return { label: 'Order Released but Problem', tone: 'problem' };
    default:
      return null;
  }
}

// Discount dashboard section (V4.7) — see DISCOUNT_BUCKETS in the server's
// orderService.js for the classification rules (the client only needs the
// display labels below, never the bucket list itself). Colours mirror the
// Order Status tones (green/yellow/red/blue) purely for visual reuse — the
// underlying meaning is unrelated to Order Status.
export function discountBucketMeta(value) {
  switch (value) {
    case 'sales_rep':
      return { label: 'Sales Rep Special Discount', tone: 'released' };
    case 'rdd':
      return { label: 'RDD - Range Density Discount', tone: 'hold' };
    case 'both':
      return { label: 'Both or Combined Discounts', tone: 'cancelled' };
    case 'other':
      return { label: 'Other Discount', tone: 'problem' };
    default:
      return null;
  }
}

// Clamp a raw Pending Quantity input to a valid value: integer, ≥ 0 and
// ≤ orderedQty (when the ordered quantity is known). '' stays '' (unset).
export function clampPendingQty(raw, orderedQty) {
  if (raw === '' || raw === null || raw === undefined) return '';
  let n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return '';
  if (n < 0) n = 0;
  const max = Number(orderedQty);
  if (Number.isFinite(max) && n > max) n = max;
  return n;
}

// Human label + style token for a status.
export function statusMeta(status) {
  switch (status) {
    case 'resolved':
      return { label: 'Resolved', tone: 'resolved' };
    case 'partially_resolved':
      return { label: 'Partially Resolved', tone: 'partial' };
    default:
      return { label: 'Needs Review', tone: 'needs' };
  }
}
