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

// The per-product fulfilment comments the platform knows (V1.3).
//   'Released' — in stock, order line released
//   'OS'       — out of stock
//   'N/A'      — not available on the website
export const PRODUCT_COMMENTS = ['Released', 'OS', 'N/A'];

// Human label + style token for a product comment (badge rendering).
export function commentMeta(comment) {
  switch (comment) {
    case 'Released':
      return { label: 'Released', tone: 'released' };
    case 'OS':
      return { label: 'OS', tone: 'os' };
    case 'N/A':
      return { label: 'N/A', tone: 'na' };
    default:
      return null;
  }
}

// Per-product delivery statuses (V1.4): stored value + display label.
export const DELIVERY_STATUSES = [
  { value: 'delivered', label: 'Delivered' },
  { value: 'half_delivered', label: 'Half Delivered' },
  { value: 'not_delivered', label: 'Not Delivered' },
];

// Human label + style token for a delivery status (badge rendering).
//   delivered → green, half_delivered → yellow, not_delivered → red.
export function deliveryMeta(status) {
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', tone: 'delivered' };
    case 'half_delivered':
      return { label: 'Half Delivered', tone: 'half' };
    case 'not_delivered':
      return { label: 'Not Delivered', tone: 'not' };
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
