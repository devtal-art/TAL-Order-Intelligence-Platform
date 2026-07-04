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
