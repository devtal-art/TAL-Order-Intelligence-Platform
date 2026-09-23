import { useState } from 'react';
import ReviewTableRow from './ReviewTableRow.jsx';
import { deriveOrderStatus, statusMeta } from '../utils/order.js';

// One order rendered as a group: an identity header (Portal Order Ref, filename,
// customer, derived status) above the grouped product table. The product table
// and per-row Approve / Search actions are UNCHANGED — this only wraps them so
// the Review screen becomes order-centric.
//
// order: {
//   portalOrderRef, hasRef, filename, customer, currency,
//   rows: [{ result, item }]   // result = resolve result, item = email line item
// }
// `comments` + `onComment` are optional (V1.3): when `onComment` is provided
// (single-file review), each row gets a Comment selector; the batch review
// passes nothing and renders exactly as before.
// `fulfillment` + `onFulfillment` are optional (V1.4): when `onFulfillment` is
// provided, each row gets Pending Qty + Item Status delivery tracking.
// `notes` + `onNote` are optional (V1.7): free-text Additional Comment column.
// `onRemove` is optional (V1.7): delete action for manually added rows only.
export default function OrderReviewGroup({ order, onApprove, comments, onComment, fulfillment, onFulfillment, notes, onNote, onRemove, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  const results = order.rows.map((r) => r.result);
  const approved = results.filter((r) => r.status === 'approved').length;
  const needs = results.length - approved;
  const meta = statusMeta(deriveOrderStatus(results));

  // Toggling on click (not a native <button>, see below) needs one guard:
  // if the click is the end of a text-selection drag (copying the Customer
  // Name / Postcode / Order Ref), the mouseup still fires a click event —
  // without this check the header would collapse right as the user
  // finishes selecting, discarding their selection before they can copy it.
  const toggleOpen = () => {
    if (window.getSelection && String(window.getSelection())) return;
    setOpen((v) => !v);
  };
  const handleHeaderKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  return (
    <div className={`og-card status-${meta.tone}`}>
      {/* A native <button> blocks text selection inside it entirely (browsers
          never start a selection drag on button content), which is exactly
          why Customer Name / Postcode couldn't be copied from here — a div
          with role="button" keeps the same click-to-toggle/keyboard/ARIA
          behavior but allows normal text selection. */}
      <div
        className="og-head"
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className={`og-chevron${open ? ' open' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div className="og-head-main">
          <div className="og-ref-row">
            <span className="og-ref-label">Portal Order Ref</span>
            <span className="og-ref">{order.portalOrderRef}</span>
            {!order.hasRef && <span className="og-noref">no ref in email</span>}
          </div>
          <div className="og-meta">
            <span className="og-meta-item" title={order.filename}>
              <span className="og-meta-k">File</span> {order.filename || '—'}
            </span>
            <span className="og-meta-item" title={order.customer}>
              <span className="og-meta-k">Customer</span> {order.customer || '—'}
            </span>
            {order.postcode && (
              <span className="og-meta-item" title={order.postcode}>
                <span className="og-meta-k">Postcode</span> {order.postcode}
              </span>
            )}
            {order.orderTotal && (
              <span className="og-meta-item" title={order.orderTotal}>
                <span className="og-meta-k">Order Total</span> {order.orderTotal}
              </span>
            )}
          </div>
        </div>
        <div className="og-head-right">
          <span className={`og-status og-status-${meta.tone}`}>{meta.label}</span>
          <span className="og-counts">
            {approved > 0 && <span className="og-count approved">{approved} ✓</span>}
            {needs > 0 && <span className="og-count needs">{needs} ⚠</span>}
          </span>
        </div>
      </div>

      {open && (
        <div className="og-body">
          <div className="rt-scroll">
            <table className="rt-table">
              <thead>
                <tr className="rt-groups">
                  <th className="rt-grp rt-grp-email" colSpan={4}>Order details · from email</th>
                  <th className="rt-grp rt-grp-match" colSpan={4}>Website match · from catalog</th>
                  {onFulfillment && <th className="rt-grp rt-grp-fulfil" colSpan={2}>Delivery</th>}
                  {onComment && <th className="rt-grp rt-grp-comment" rowSpan={2}>Reason</th>}
                  {onNote && <th className="rt-grp rt-grp-note" rowSpan={2}>Comments</th>}
                  <th className="rt-grp rt-grp-act" rowSpan={2}>Action</th>
                </tr>
                <tr className="rt-cols">
                  <th className="rt-email">Product Name</th>
                  <th className="rt-email">Package</th>
                  <th className="rt-email rt-num rt-highlight">QTY</th>
                  <th className="rt-email rt-num rt-highlight">Unit Price</th>
                  <th className="rt-match">Item No</th>
                  <th className="rt-match">Product Name</th>
                  <th className="rt-match rt-num">Match</th>
                  <th className="rt-match">Status</th>
                  {onFulfillment && <th className="rt-fulfil rt-num">Pending Qty</th>}
                  {onFulfillment && <th className="rt-fulfil">Item Status</th>}
                </tr>
              </thead>
              <tbody>
                {order.rows.map(({ result, item, key }) => (
                  <ReviewTableRow
                    key={key || result.lineId}
                    result={result}
                    item={item}
                    currency={order.currency}
                    onApprove={onApprove}
                    comment={comments ? comments[result.lineId] || '' : ''}
                    onComment={onComment}
                    fulfillment={fulfillment ? fulfillment[result.lineId] : undefined}
                    onFulfillment={onFulfillment}
                    note={notes ? notes[result.lineId] || '' : ''}
                    onNote={onNote}
                    onRemove={onRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
