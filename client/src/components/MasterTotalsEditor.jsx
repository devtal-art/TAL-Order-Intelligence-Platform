import { currencySymbol } from '../utils/format.js';

// Master Totals editor for Manual Order Creation (V3.1 — new). Fully manual,
// unlimited { label, amount } rows (Subtotal, VAT, Delivery, Discount,
// Handling, Other Charges, or anything the user types) — no tie to the
// product rows. Grand Total is the live sum of every row. Each row maps 1:1
// onto financials.discounts[] (see manualOrderBuilder.buildFinancialsFromMasterTotals),
// the same shape OrderFinancials.jsx / buildXLSX.js already render generically.
export default function MasterTotalsEditor({ rows, onAdd, onRemove, onUpdate, grandTotal, currency = 'GBP' }) {
  const sym = currencySymbol(currency);

  return (
    <div className="mo-section">
      <div className="mo-section-title">Master Totals</div>
      <div className="mte-rows">
        {rows.map((row, i) => (
          <div className="mte-row" key={row.id}>
            <input
              type="text"
              className="mte-label"
              value={row.label}
              placeholder={i === 0 ? 'e.g. Subtotal' : 'e.g. VAT, Delivery, Discount…'}
              onChange={(e) => onUpdate(row.id, { label: e.target.value })}
              aria-label={`Master total row ${i + 1} label`}
            />
            <div className="mte-amount-wrap">
              <span className="mte-sym">{sym}</span>
              <input
                type="number"
                step="0.01"
                className="mte-amount"
                value={row.amount}
                placeholder="0.00"
                onChange={(e) => onUpdate(row.id, { amount: e.target.value })}
                aria-label={`Master total row ${i + 1} amount`}
              />
            </div>
            <button
              type="button"
              className="mte-remove"
              onClick={() => onRemove(row.id)}
              disabled={rows.length <= 1}
              aria-label={`Remove master total row ${i + 1}`}
              title={rows.length > 1 ? 'Remove this row' : 'At least one row is required'}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="mte-add" onClick={onAdd}>
        + Add Row
      </button>

      <div className="mte-grand" aria-live="polite">
        <span>Grand Total</span>
        <b>{grandTotal < 0 ? '-' : ''}{sym}{Math.abs(grandTotal).toFixed(2)}</b>
      </div>
    </div>
  );
}
