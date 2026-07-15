import { currencySymbol } from '../utils/format.js';

// Order financial breakdown (V1.8, display-only). Mirrors the totals section
// at the bottom of the order email — Sub Total, Discount (with the email's own
// label text), Transportation Charges, Total — read straight from the parsed
// `financials`, never recalculated. Rows render dynamically: values the email
// didn't carry are omitted, and when there is no totals data at all (older /
// edge orders) the whole card is hidden. Shared by the Review screen and the
// Saved Order modal so both display identically.
export default function OrderFinancials({ financials }) {
  const f = financials || {};
  const sym = currencySymbol(f.currency);
  const money = (n) => `${Number(n) < 0 ? '-' : ''}${sym}${Math.abs(Number(n) || 0).toFixed(2)}`;

  const subTotal = Number(f.sub_total) || 0;
  const transport = Number(f.transportation_charges) || 0;
  const total = Number(f.total) || 0;

  // Discount: prefer the parsed value (with the email's own label). Orders
  // saved before the discount-label parser fix carry 0 here even though the
  // email had one — recover it from the totals identity
  // (sub_total + transport + discount = total), so PAST orders display it too.
  // A positive residue (e.g. a tax the parser doesn't itemize) is shown as
  // "Other Charges" rather than being hidden.
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
  // The email always lists transport under its totals; keep the £0.00 row when
  // a totals section exists so the card mirrors the mail.
  if (subTotal > 0 || transport > 0) rows.push({ key: 'trans', label: 'Transportation Charges', value: money(transport) });
  if (total > 0) rows.push({ key: 'total', label: 'Total', value: money(total), strong: true });
  if (!rows.length) return null;

  return (
    <div className="fin-card" aria-label="Order totals">
      {rows.map((r) => (
        <div key={r.key} className={`fin-row${r.strong ? ' fin-total' : ''}`}>
          <span className="fin-label">{r.label}</span>
          <span className="fin-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}