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
// provided, each row gets Pending Qty + Order Status delivery tracking.
export default function OrderReviewGroup({ order, onApprove, comments, onComment, fulfillment, onFulfillment, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  const results = order.rows.map((r) => r.result);
  const approved = results.filter((r) => r.status === 'approved').length;
  const needs = results.length - approved;
  const meta = statusMeta(deriveOrderStatus(results));

  return (
    <div className={`og-card status-${meta.tone}`}>
      <button className="og-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
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
          </div>
        </div>
        <div className="og-head-right">
          <span className={`og-status og-status-${meta.tone}`}>{meta.label}</span>
          <span className="og-counts">
            {approved > 0 && <span className="og-count approved">{approved} ✓</span>}
            {needs > 0 && <span className="og-count needs">{needs} ⚠</span>}
          </span>
        </div>
      </button>

      {open && (
        <div className="og-body">
          <div className="rt-scroll">
            <table className="rt-table">
              <thead>
                <tr className="rt-groups">
                  <th className="rt-grp rt-grp-email" colSpan={5}>Order details · from email</th>
                  <th className="rt-grp rt-grp-match" colSpan={4}>Website match · from catalog</th>
                  {onFulfillment && <th className="rt-grp rt-grp-fulfil" colSpan={2}>Delivery</th>}
                  {onComment && <th className="rt-grp rt-grp-comment" rowSpan={2}>Comment</th>}
                  <th className="rt-grp rt-grp-act" rowSpan={2}>Action</th>
                </tr>
                <tr className="rt-cols">
                  <th className="rt-email">Product Name</th>
                  <th className="rt-email">Package</th>
                  <th className="rt-email rt-num">QTY</th>
                  <th className="rt-email rt-num">Unit Price</th>
                  <th className="rt-email rt-num">Total Price</th>
                  <th className="rt-match">Item No</th>
                  <th className="rt-match">Product Name</th>
                  <th className="rt-match rt-num">Match</th>
                  <th className="rt-match">Status</th>
                  {onFulfillment && <th className="rt-fulfil rt-num">Pending Qty</th>}
                  {onFulfillment && <th className="rt-fulfil">Order Status</th>}
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
