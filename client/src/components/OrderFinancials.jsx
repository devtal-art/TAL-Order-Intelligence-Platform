import { currencySymbol } from '../utils/format.js';

// Quantity of an OS line that is out of stock: the entered Pending Qty
// (clamped to 0…ordered), or the whole ordered quantity when none is entered.
function osPendingQty(raw, orderedQty) {
  const ordered = Number(orderedQty) || 0;
  if (raw === null || raw === undefined || raw === '') return ordered;
  const n = Number(raw);
  if (!Number.isFinite(n)) return ordered;
  return Math.min(Math.max(n, 0), ordered);
}

// Order financial breakdown (V1.8, display-only). Mirrors the totals section
// at the bottom of the order email — Sub Total, Discount (with the email's own
// label text), Transportation Charges, Total — read straight from the parsed
// `financials`, never recalculated. Rows render dynamically: values the email
// didn't carry are omitted, and when there is no totals data at all (older /
// edge orders) the whole card is hidden. Shared by the Review screen and the
// Saved Order modal so both display identically.
export default function OrderFinancials({ financials, results = [], lineItems = [], comments = {}, fulfillment = {}, orderSource, litInvoice = false }) {
  const f = financials || {};
  const sym = currencySymbol(f.currency);
  const money = (n) => `${Number(n) < 0 ? '-' : ''}${sym}${Math.abs(Number(n) || 0).toFixed(2)}`;

  // Manual orders (V3.1) have no "original email" to compare against — every
  // product row is built via the same manual_addition source HTML orders use
  // for the "+ Add Product" feature, which would otherwise make the
  // Updated/Original comparison below fire for the WHOLE order. So for manual
  // orders only Not Found / OS lines count as adjustments (they come off the
  // Sub Total); with none of those, hasAdjustments stays false and a single
  // card renders (see the title/updatedCard logic further down). HTML orders
  // (orderSource undefined/'HTML') behave exactly as before.
  const isManualOrder = orderSource === 'MANUAL';

  const subTotal = Number(f.sub_total) || 0;
  const transport = Number(f.transportation_charges) || 0;
  const total = Number(f.total) || 0;

  // Calculate totalAdjustment and check if we have any adjustments
  let totalAdjustment = 0;
  let hasAdjustments = false;

  results.forEach((r) => {
    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && lineItems[lineIndex]) || null;
    if (!item) return;

    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const itemTotal = qty * Math.abs(unitPrice);
    const comment = comments[r.lineId] || '';
    const isNotFound = comment === 'Not Found';
    // On a manual order every line carries the manual_addition source and is
    // already inside its Sub Total, so "manual additions" and negative-price
    // lines only count as adjustments for email orders.
    const isManual = !isManualOrder && r.source === 'manual_addition';
    const isNegative = !isManualOrder && unitPrice < 0;

    // OS lines: the pending quantity is out of stock, so its value comes
    // off the total — unit price × Pending Qty. With no Pending Qty
    // entered the whole ordered quantity counts as pending. Same amount
    // convention as Not Found above (absolute unit price).
    const osValue = comment === 'OS' ? osPendingQty(fulfillment[r.lineId]?.pendingQty, qty) * Math.abs(unitPrice) : 0;

    if (isManual || isNotFound || isNegative || osValue > 0) {
      hasAdjustments = true;
    }

    if (isNotFound) {
      totalAdjustment -= itemTotal;
    } else if (isManual) {
      if (isNegative) {
        totalAdjustment -= itemTotal;
      } else {
        totalAdjustment += itemTotal;
      }
    }
    totalAdjustment -= osValue;
  });

  // Actually Delivered (V6.0) — the third card. Computed as a DELTA off the
  // Updated card rather than re-summing every line from scratch, for the
  // same reason the Updated card is a delta off the Original: `subTotal`
  // comes from the email's own totals block, so re-adding the line items
  // would drift from it whenever the parser and the email disagree by a
  // rounding penny. Working in deltas means a line with no Actual Delivered
  // Qty recorded contributes nothing, and the card therefore matches the
  // Updated one exactly until somebody actually enters a quantity.
  //
  // `assumedQty` is the quantity the Updated card already counted for that
  // line: zero for a Not Found line (it was taken out of the totals
  // altogether), the ordered quantity for everything else. The signed unit
  // price is used as-is, so a negative-priced line moves the total the
  // correct way without a special case.
  let deliveredAdjustment = 0;
  let hasDelivered = false;

  results.forEach((r) => {
    const raw = fulfillment[r.lineId]?.deliveredQty;
    if (raw === null || raw === undefined || raw === '') return;
    const deliveredQty = Number(raw);
    if (!Number.isFinite(deliveredQty)) return;

    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && lineItems[lineIndex]) || null;
    if (!item) return;

    // A recorded quantity shows the card even when it happens to equal what
    // was ordered — "delivered in full" is itself worth confirming.
    hasDelivered = true;

    const unitPrice = Number(item.unit_price) || 0;
    // Matches what the Updated card counted for the line: nothing for Not
    // Found, ordered minus pending for OS, the full ordered quantity otherwise.
    const orderedQty = Number(item.qty) || 0;
    let assumedQty = orderedQty;
    if (comments[r.lineId] === 'Not Found') assumedQty = 0;
    else if (comments[r.lineId] === 'OS') {
      assumedQty = orderedQty - osPendingQty(fulfillment[r.lineId]?.pendingQty, orderedQty);
    }
    deliveredAdjustment += (deliveredQty - assumedQty) * unitPrice;
  });

  // Discounts: an email can carry more than one discount line (e.g. a
  // frozen-range volume discount AND a separate sales-rep discount). Prefer
  // the parser's full `discounts` list so every line's own label survives;
  // fall back to the single discount value (or a computed diff) for orders
  // saved before this list existed.
  let discountRows = Array.isArray(f.discounts) && f.discounts.length
    ? f.discounts
        .filter((d) => Number(d.amount) !== 0)
        .map((d, i) => ({ key: `disc-${i}`, label: d.label || 'Discount', value: money(d.amount) }))
    : null;

  if (!discountRows) {
    const storedDiscount = Number(f.discount) || 0;
    const storedLabel = f.discount_label || 'Discount';
    const out = [];
    if (storedDiscount !== 0) out.push({ key: 'disc', label: storedLabel, value: money(storedDiscount) });

    // Orders saved before the parser tracked every discount line only kept the
    // LAST one it saw — the stored `total` was still parsed correctly, though,
    // so any gap between subTotal - storedDiscount - transport and total means
    // an earlier discount line's amount (its exact label is gone) is missing.
    // Surface that gap as its own row so the breakdown adds up to `total`
    // again, instead of silently under-reporting the discount.
    if (subTotal > 0 && total > 0) {
      const diff = Math.round((total - subTotal - transport) * 100) / 100;
      const remainder = Math.round((diff - storedDiscount) * 100) / 100;
      if (Math.abs(remainder) >= 0.01) {
        const label = storedDiscount !== 0 ? 'Other Discount' : (remainder < 0 ? 'Discount' : 'Other Charges');
        out.push({ key: 'disc-extra', label, value: money(remainder) });
      }
    }
    discountRows = out;
  }

  const rows = [];
  if (subTotal > 0) rows.push({ key: 'sub', label: 'Sub Total', value: money(subTotal) });
  rows.push(...discountRows);
  if (subTotal > 0 || transport > 0) rows.push({ key: 'trans', label: 'Transportation Charges', value: money(transport) });
  if (total > 0) rows.push({ key: 'total', label: 'Total', value: money(total), strong: true });

  if (!rows.length && !hasAdjustments) return null;

  // Title: manual orders always get their own label (there's only ever one
  // card for them); HTML orders keep the exact previous behavior — a title
  // only appears once there's a second (Updated) card to distinguish it from.
  const originalTitle = isManualOrder ? 'Manual Order Price' : (hasAdjustments ? 'Original (Email)' : null);

  const originalCard = rows.length ? (
    <div className="fin-card" key="original" aria-label={isManualOrder ? 'Manual order totals' : 'Original order totals'}>
      {originalTitle && <div className="fin-title">{originalTitle}</div>}
      {rows.map((r) => (
        <div key={r.key} className={`fin-row${r.strong ? ' fin-total' : ''}`}>
          <span className="fin-label">{r.label}</span>
          <span className="fin-value">{r.value}</span>
        </div>
      ))}
    </div>
  ) : null;

  let updatedCard = null;
  if (hasAdjustments && rows.length) {
    const updatedSub = subTotal + totalAdjustment;
    const updatedTot = total + totalAdjustment;
    const upRows = [];
    if (subTotal !== 0 || updatedSub !== 0) upRows.push({ key: 'sub', label: 'Sub Total', value: money(updatedSub) });
    upRows.push(...discountRows.map((r) => ({ ...r, key: `up-${r.key}` })));
    if (subTotal !== 0 || transport > 0 || updatedSub !== 0) upRows.push({ key: 'trans', label: 'Transportation Charges', value: money(transport) });
    upRows.push({ key: 'total', label: 'Total', value: money(updatedTot), strong: true });
    
    updatedCard = (
      <div className={`fin-card is-updated${litInvoice ? ' is-lit' : ''}`} key="updated" aria-label={litInvoice ? 'Lit invoice totals' : 'Updated order totals'}>
        <div className="fin-title">{litInvoice ? 'Lit Invoice amount' : 'Updated (with manual additions)'}</div>
        {upRows.map((r) => (
          <div key={r.key} className={`fin-row${r.strong ? ' fin-total' : ''}`}>
            <span className="fin-label">{r.label}</span>
            <span className="fin-value">{r.value}</span>
          </div>
        ))}
      </div>
    );
  } else if (hasAdjustments && !rows.length) {
    updatedCard = (
      <div className={`fin-card is-updated${litInvoice ? ' is-lit' : ''}`} key="updated" aria-label={litInvoice ? 'Lit invoice totals' : 'Updated order totals'}>
        <div className="fin-title">{litInvoice ? 'Lit Invoice amount' : 'Updated (with manual additions)'}</div>
        <div className="fin-row">
          <span className="fin-label">Manual Additions Subtotal</span>
          <span className="fin-value">{money(totalAdjustment)}</span>
        </div>
        <div className="fin-row fin-total">
          <span className="fin-label">Total</span>
          <span className="fin-value">{money(totalAdjustment)}</span>
        </div>
      </div>
    );
  }

  // Discount and Transportation Charges are carried across unchanged, the
  // same convention the Updated card follows — only the line-item side of
  // the order is restated here.
  let deliveredCard = null;
  if (hasDelivered && rows.length) {
    const baseSub = hasAdjustments ? subTotal + totalAdjustment : subTotal;
    const baseTot = hasAdjustments ? total + totalAdjustment : total;
    const deliveredSub = baseSub + deliveredAdjustment;
    const delRows = [];
    if (subTotal !== 0 || deliveredSub !== 0) delRows.push({ key: 'sub', label: 'Sub Total', value: money(deliveredSub) });
    delRows.push(...discountRows.map((r) => ({ ...r, key: `del-${r.key}` })));
    if (subTotal !== 0 || transport > 0 || deliveredSub !== 0) delRows.push({ key: 'trans', label: 'Transportation Charges', value: money(transport) });
    delRows.push({ key: 'total', label: 'Total', value: money(baseTot + deliveredAdjustment), strong: true });

    deliveredCard = (
      <div className="fin-card is-delivered" key="delivered" aria-label="Actually delivered order totals">
        <div className="fin-title">Actually Delivered</div>
        {delRows.map((r) => (
          <div key={r.key} className={`fin-row${r.strong ? ' fin-total' : ''}`}>
            <span className="fin-label">{r.label}</span>
            <span className="fin-value">{r.value}</span>
          </div>
        ))}
      </div>
    );
  }

  // Most-restated first, original last: Actually Delivered → Updated →
  // Original. Any of the three can be absent, so they're assembled as a list
  // and the side-by-side wrapper only appears once there's more than one.
  const cards = [deliveredCard, updatedCard, originalCard].filter(Boolean);
  if (cards.length > 1) return <div className="fin-wrapper">{cards}</div>;
  return cards[0] || null;
}