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

  // Discount: prefer the parsed value (with the email's own label)
  let discount = Number(f.discount) || 0;
  let discountLabel = f.discount_label || 'Discount';
  if (discount === 0 && subTotal > 0 && total > 0) {
    const diff = Math.round((total - subTotal - transport) * 100) / 100;
    if (Math.abs(diff) >= 0.01) {
      discount = diff;
      discountLabel = diff < 0 ? 'Discount' : 'Other Charges';
    }
  }

  const rows = [];
  if (subTotal > 0) rows.push({ key: 'sub', label: 'Sub Total', value: money(subTotal) });
  if (discount !== 0) rows.push({ key: 'disc', label: discountLabel, value: money(discount) });
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
    if (discount !== 0) upRows.push({ key: 'disc', label: discountLabel, value: money(discount) });
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