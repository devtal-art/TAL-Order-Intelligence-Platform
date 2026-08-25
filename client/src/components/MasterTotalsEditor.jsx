import { currencySymbol } from '../utils/format.js';

// Master Totals editor for Manual Order Creation (V3.1 — new; auto Subtotal
// added later). The Subtotal row is automatic — the live sum of every
// product row's Total (qty × unit price), read-only, not one of these rows —
// so these rows are for ADJUSTMENTS on top of it (VAT, Delivery, Discount,
// Handling, Other Charges, or anything the user types), unlimited
// { label, amount }, no tie to the product rows. Grand Total = productsSubtotal
// + the live sum of every adjustment row below. Each adjustment row maps 1:1
// onto financials.discounts[] (see manualOrderBuilder.buildFinancialsFromMasterTotals,
// which now also receives productsSubtotal for financials.sub_total), the
// same shape OrderFinancials.jsx / buildXLSX.js already render generically.
export default function MasterTotalsEditor({ rows, onAdd, onRemove, onUpdate, productsSubtotal = 0, grandTotal, currency = 'GBP' }) {
  const sym = currencySymbol(currency);

  return (
    <div className="mo-section">
      <div className="mo-section-title">Master Totals</div>

      <div className="mte-subtotal" aria-live="polite">
        <span>Subtotal <em>(sum of product totals)</em></span>
        <b>{sym}{productsSubtotal.toFixed(2)}</b>
      </div>

      <div className="mte-rows">
        {rows.map((row, i) => (
          <div className="mte-row" key={row.id}>
            <input
              type="text"
              className="mte-label"
              value={row.label}
              placeholder="e.g. VAT, Delivery, Discount…"
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
