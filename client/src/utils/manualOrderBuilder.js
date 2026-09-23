// Manual Order Creation helpers (V3.1 — new, additive). Pure functions only —
// no API calls, no React. These build the SAME `parsed_data.order_info` /
// `billing_address` / `delivery_address` / `financials` shapes that
// parseOrderHTML.js produces, so a manually-created order is indistinguishable
// downstream from an HTML-parsed one. This file is intentionally separate from
// utils/manualProduct.js (used by the existing "+ Add Product" feature) so
// nothing here ever touches that shared, upload-flow-adjacent module.

let idCounter = 0;
// Simple unique id for React keys (rows are client-only until save; the real
// lineId is assigned positionally at save time). crypto.randomUUID() isn't
// available in all embedded/older WebViews, hence the counter fallback.
export function nextRowId() {
  idCounter += 1;
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `row_${Date.now()}_${idCounter}`;
}

export function emptyAddress() {
  return { company_name: '', contact_name: '', address: '', city: '', county: '', country: '', post_code: '', phone: '' };
}

export function emptyProductRow() {
  return {
    id: nextRowId(),
    itemNo: '',
    websiteProductName: '',
    emailProductName: '',
    qty: '1',
    unitPrice: '',
    // Item Status (fulfillment.status) + Reason (product_comments) — same
    // per-product delivery-tracking fields the Saved Order edit view offers,
    // optional at creation time like everything else on this row.
    status: '',
    comment: '',
    // Pending Qty (fulfillment.pendingQty) — only meaningful once Reason is
    // 'OS' (see ManualOrderProductRow), same field the Review/Saved-Order
    // screens track. Kept '' (unset) otherwise.
    pendingQty: '',
    notes: '',
  };
}

export function emptyMasterTotalRow() {
  return { id: nextRowId(), label: '', amount: '' };
}

// order_info shape mirrors parseOrderHTML.js exactly, plus one additive key
// (delivery_date) that the parser never sets — parsed_data is Mongoose Mixed,
// so this needs no schema change anywhere.
export function buildOrderInfo({ orderNumber, orderDate, deliveryDate, referenceNumber, notes }) {
  return {
    order_ref: String(orderNumber || '').trim(),
    customer_id: '',
    order_date: String(orderDate || '').trim(),
    representative: '',
    po_number: String(referenceNumber || '').trim(),
    payment_type: '',
    additional_comments: String(notes || '').trim(),
    delivery_date: String(deliveryDate || '').trim(),
  };
}

// Sum of every product row's Total (unitPrice × qty), same formula
// ManualOrderProductRow.jsx uses per-row (kept in sync manually — that
// component computes its own row total inline for display; this is the
// aggregate used to auto-fill the Master Totals Subtotal row and financials.
// sub_total). Blank/invalid unit price reads as 0, same as the row display.
export function computeProductsSubtotal(productRows) {
  const sum = (productRows || []).reduce((acc, r) => {
    const q = Number(r.qty) || 0;
    const unit = String(r.unitPrice ?? '').trim() === '' ? 0 : Number(r.unitPrice) || 0;
    return acc + unit * q;
  }, 0);
  return Math.round(sum * 100) / 100;
}

// Master Totals rows are for adjustments on top of the products subtotal
// (discount, transportation, etc.) — each non-empty row becomes one entry in
// `financials.discounts[]`, the same { label, amount } shape already rendered
// generically by OrderFinancials.jsx and buildXLSX.js (added for multi-discount
// HTML orders). `subTotal` (the auto-computed products total, NOT a Master
// Totals row) now populates `financials.sub_total` for real, matching how
// parseOrderHTML.js populates it for HTML orders — `total` follows the same
// sub_total + transportation_charges + adjustments shape (transportation_
// charges stays 0 here; manual orders have never separated it from the
// generic Master Totals rows, unchanged by this).
export function buildFinancialsFromMasterTotals(masterTotalRows, subTotal = 0, currency = 'GBP') {
  const discounts = (masterTotalRows || [])
    .filter((r) => String(r.label || '').trim() && Number(r.amount) !== 0 && !Number.isNaN(Number(r.amount)))
    .map((r) => ({ label: String(r.label).trim(), amount: Math.round(Number(r.amount) * 100) / 100 }));

  const adjustments = Math.round(discounts.reduce((sum, d) => sum + d.amount, 0) * 100) / 100;
  const sub_total = Math.round((Number(subTotal) || 0) * 100) / 100;
  const transportation_charges = 0;
  const total = Math.round((sub_total + transportation_charges + adjustments) * 100) / 100;

  return {
    sub_total,
    transportation_charges,
    // Legacy singular fields kept for any code still reading them directly —
    // best-effort mirror of the first row, never the source of truth (discounts[] is).
    discount: discounts[0]?.amount || 0,
    discount_label: discounts[0]?.label || 'Discount',
    discounts,
    total,
    currency,
  };
}

// Whether a product row has nothing worth keeping — used to silently drop
// trailing blank rows rather than reject the whole form for them.
export function isProductRowEmpty(row) {
  return (
    !String(row.itemNo || '').trim() &&
    !String(row.websiteProductName || '').trim() &&
    !String(row.emailProductName || '').trim() &&
    !String(row.unitPrice ?? '').trim() &&
    (row.qty === '' || row.qty === '1' || row.qty == null)
  );
}

export function isMasterTotalRowEmpty(row) {
  return !String(row.label || '').trim() && !String(row.amount ?? '').trim();
}

// Per-row validation. Relaxed vs. utils/manualProduct.js's validateManualProduct:
// itemNo is NOT required here — Case 4 of the smart lookup explicitly allows a
// row with only a typed name and no confirmed catalog item ("do not block
// saving"). Returns an error string, or '' when valid.
export function validateProductRow(row, index) {
  const label = `Product ${index + 1}`;
  const hasIdentity = String(row.itemNo || '').trim() || String(row.websiteProductName || '').trim() || String(row.emailProductName || '').trim();
  if (!hasIdentity) return `${label}: enter an Item Number or a Product Name.`;

  const q = Number(row.qty);
  if (String(row.qty).trim() === '' || !Number.isInteger(q) || q < 1) {
    return `${label}: quantity must be a whole number of 1 or more.`;
  }
  if (String(row.unitPrice ?? '').trim() !== '' && !Number.isFinite(Number(row.unitPrice))) {
    return `${label}: unit price must be a valid number.`;
  }
  return '';
}

// Whole-form validation (Company, >=1 real product row, no duplicate empty
// rows, each row individually valid). Order Number is no longer part of
// this (V5) — it's server-assigned, never user input, so there's nothing
// here to validate.
export function validateManualOrderForm({ companyName, productRows }) {
  if (!String(companyName || '').trim()) return 'Company Name is required.';

  const realRows = (productRows || []).filter((r) => !isProductRowEmpty(r));
  if (realRows.length === 0) return 'Add at least one product.';

  for (let i = 0; i < realRows.length; i += 1) {
    const err = validateProductRow(realRows[i], i);
    if (err) return err;
  }

  return '';
}

// Normalize a Unit Price input to a stored number: empty → 0, else round to 2dp.
// Mirrors utils/manualProduct.js's normalizeUnitPrice exactly (kept as a
// separate copy so this file has zero import dependency on that module).
export function normalizeUnitPrice(unitPrice) {
  if (String(unitPrice ?? '').trim() === '') return 0;
  return Math.round(Number(unitPrice) * 100) / 100;
}
