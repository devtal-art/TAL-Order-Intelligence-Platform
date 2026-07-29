import { currencySymbol } from '../utils/format.js';

// Order financial breakdown (V1.8, display-only). Mirrors the totals section
// at the bottom of the order email — Sub Total, Discount (with the email's own
// label text), Transportation Charges, Total — read straight from the parsed
// `financials`, never recalculated. Rows render dynamically: values the email
// didn't carry are omitted, and when there is no totals data at all (older /
// edge orders) the whole card is hidden. Shared by the Review screen and the
// Saved Order modal so both display identically.
export default function OrderFinancials({ financials, results = [], lineItems = [], comments = {} }) {
  const f = financials || {};
  const sym = currencySymbol(f.currency);
  const money = (n) => `${Number(n) < 0 ? '-' : ''}${sym}${Math.abs(Number(n) || 0).toFixed(2)}`;

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
    const isManual = r.source === 'manual_addition';
    const isNegative = unitPrice < 0;

    if (isManual || isNotFound || isNegative) {
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

  const originalCard = rows.length ? (
    <div className="fin-card" aria-label="Original order totals">
      {hasAdjustments && <div className="fin-title">Original (Email)</div>}
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
      <div className="fin-card is-updated" aria-label="Updated order totals">
        <div className="fin-title">Updated (with manual additions)</div>
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
      <div className="fin-card is-updated" aria-label="Updated order totals">
        <div className="fin-title">Updated (with manual additions)</div>
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

  if (updatedCard) {
    return (
      <div className="fin-wrapper">
        {updatedCard}
        {originalCard}
      </div>
    );
  }

  return originalCard;
}