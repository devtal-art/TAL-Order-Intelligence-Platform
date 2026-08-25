// Manual "Add Product to Order" helpers (V1.6). Pure functions shared by the
// post-upload Review screen and the Saved-Order edit modal so a manually
// added product is built identically in both flows.
//
// A manual product comes straight from the Master Product Catalog, so it is
// already approved: its resolve result uses the exact shape the resolver
// returns for approved lines (status 'approved', confidence 100, match {…}) —
// no new approval flow, no schema change. The line item mirrors the parser's
// line_items shape, and because the product is APPENDED to line_items and
// results together, the existing lineId contract (String(index + 1) into
// line_items) keeps holding for every line, old and new.

// After a MANUAL order's product list changes (add/remove, on the Saved
// Order detail view), recompute financials.sub_total to match — same
// meaning as Create Manual Order's auto Subtotal row (sum of every line
// item's Total). Existing adjustment rows (discounts[]/transportation_
// charges, from Master Totals at creation) are kept as-is; only sub_total
// and total move. HTML orders are NEVER passed through this — their
// sub_total is the figure parsed from the original email, an independent
// business record that must not be silently overwritten just because a
// product was later added/removed (buildXLSX.js already shows the
// as-of-now adjusted figure via a display-time delta instead).
export function recomputeManualSubtotal(financials, lineItems) {
  const subTotal = Math.round(
    (lineItems || []).reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100
  ) / 100;
  const f = financials || {};
  const transport = Number(f.transportation_charges) || 0;
  const adjustments = Array.isArray(f.discounts)
    ? f.discounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    : 0;
  const total = Math.round((subTotal + transport + adjustments) * 100) / 100;
  return { ...f, sub_total: subTotal, total };
}

// Item numbers already approved in the order. INFORMATIONAL only (V1.9): the
// Add Product search marks these rows "In order" as a hint — adding the same
// catalog product again is allowed and creates an independent order line.
export function approvedItemNos(results) {
  const set = new Set();
  for (const r of Array.isArray(results) ? results : []) {
    if (r?.status === 'approved' && r.match?.itemNo) set.add(String(r.match.itemNo));
  }
  return set;
}

// Validate the Add Product form input. Returns an error message, or '' when valid.
// Unit Price is OPTIONAL (V1.7): empty or 0 are both fine — only a negative or
// non-numeric value is rejected. Adding the SAME catalog product again is
// allowed by design (V1.9) — each addition is an independent order line
// (different price/qty/batch/note are valid business cases).
export function validateManualProduct({ itemNo, emailProductName, qty, unitPrice }) {
  if (!itemNo) return 'Select a product from the catalog first.';
  if (!String(emailProductName ?? '').trim()) return 'Email product name cannot be empty.';
  const q = Number(qty);
  if (String(qty).trim() === '' || !Number.isInteger(q) || q < 1) {
    return 'Quantity must be a whole number of 1 or more.';
  }
  if (String(unitPrice ?? '').trim() !== '') {
    const p = Number(unitPrice);
    if (!Number.isFinite(p)) return 'Unit price must be a valid number.';
  }
  return '';
}

// Normalize a Unit Price input to a stored number: empty → 0, else round to 2dp.
export function normalizeUnitPrice(unitPrice) {
  if (String(unitPrice ?? '').trim() === '') return 0;
  return Math.round(Number(unitPrice) * 100) / 100;
}

// Append one manual product to a parsed + resolution snapshot pair. Returns
// new { parsed, resolution, lineId } objects — the inputs are never mutated.
// Total Price is DERIVED: Unit Price × Quantity (V1.7).
export function appendManualProduct(parsed, resolution, { websiteProductName, itemNo, emailProductName, qty, unitPrice }) {
  const items = Array.isArray(parsed?.line_items) ? parsed.line_items : [];
  const results = Array.isArray(resolution?.results) ? resolution.results : [];

  const q = Number(qty);
  const unit = normalizeUnitPrice(unitPrice);
  const total = Math.round(unit * q * 100) / 100;
  const name = String(emailProductName).trim();
  const lineId = String(items.length + 1);

  const lineItem = {
    product_code: 'N.A', // same default the parser uses when the email carries no code
    description: name,
    package: 'N/A', // not parsed from an email — there is no package text
    qty: q,
    unit_price: unit,
    total,
  };

  const result = {
    lineId,
    emailProductName: name,
    status: 'approved',
    confidence: 100,
    reason: 'Added manually from the product catalog.',
    source: 'manual_addition',
    match: { websiteProductName, itemNo },
    candidates: [],
  };

  return {
    parsed: { ...parsed, line_items: [...items, lineItem] },
    resolution: { ...resolution, results: [...results, result] },
    lineId,
  };
}

// Remove one MANUALLY ADDED product (V1.7). Returns new { parsed, resolution,
// removedLineId, remap } objects, or null when the line is not a manual
// addition — HTML-parsed products can never be removed through this path.
//
// Manual lines always sit AFTER every HTML line (they are appended), so the
// only lines whose index shifts down are later manual lines, which all carry
// plain numeric lineIds. Renumbering them keeps the platform contract
// (lineId = String(index + 1) into line_items) intact for the whole order.
// `remap` = { [oldLineId]: newLineId } for those shifted lines — callers use
// it to move entries in the lineId-keyed maps (comments/fulfillment/notes).
export function removeManualProduct(parsed, resolution, lineId) {
  const items = Array.isArray(parsed?.line_items) ? parsed.line_items : [];
  const results = Array.isArray(resolution?.results) ? resolution.results : [];

  const target = results.find((r) => r?.lineId === lineId);
  if (!target || target.source !== 'manual_addition') return null;
  const index = Number(lineId) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return null;

  const remap = {};
  const nextResults = [];
  for (const r of results) {
    if (r === target) continue;
    const n = Number(r.lineId);
    if (Number.isInteger(n) && n > index + 1) {
      const newId = String(n - 1);
      remap[r.lineId] = newId;
      nextResults.push({ ...r, lineId: newId });
    } else {
      nextResults.push(r);
    }
  }

  return {
    parsed: { ...parsed, line_items: items.filter((_, i) => i !== index) },
    resolution: { ...resolution, results: nextResults },
    removedLineId: lineId,
    remap,
  };
}

// Rebuild a lineId-keyed map ({ [lineId]: value }) after a removal: drops the
// removed line's entry and moves shifted lines' entries to their new lineIds.
// Returns { next, patch } — `next` is the new map for local state, `patch` is
// the minimal { [lineId]: value | null } payload for the existing PATCH
// endpoints (null clears a key). When `fields` is given (fulfillment), moved
// object values are expanded to explicit per-field values with null for
// absent fields, so a moved entry fully overwrites the key's previous
// occupant instead of merging with it.
export function remapAfterRemoval(map, removedLineId, remap, fields) {
  const prev = map || {};
  const next = {};
  for (const [k, v] of Object.entries(prev)) {
    if (k === removedLineId) continue;
    next[remap[k] ?? k] = v;
  }

  const patch = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (JSON.stringify(prev[k] ?? null) === JSON.stringify(next[k] ?? null)) continue;
    if (next[k] === undefined) {
      patch[k] = null;
    } else if (fields) {
      patch[k] = {};
      for (const f of fields) patch[k][f] = next[k]?.[f] ?? null;
    } else {
      patch[k] = next[k];
    }
  }
  return { next, patch };
}
