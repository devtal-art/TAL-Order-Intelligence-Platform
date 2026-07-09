import { useState, useMemo } from 'react';
import OrderReviewGroup from './OrderReviewGroup.jsx';
import OrderSearchBar from './OrderSearchBar.jsx';
import { portalOrderRef, hasRealRef } from '../utils/order.js';

// Review screen (single-file). Order-centric (V1.2): the products are wrapped in
// one Order group keyed by its Portal Order Ref No, with an instant ref search.
// The grouped product table and Approve / Search actions are unchanged.
export default function ReviewView({
  results,
  parsedData,
  filename = '',
  lineItems = [],
  currency = 'GBP',
  comments = {},
  fulfillment = {},
  onApprove,
  onComment,
  onFulfillment,
  onGenerate,
  onReset,
}) {
  const [search, setSearch] = useState('');

  const total = results.length;
  const approved = results.filter((r) => r.status === 'approved').length;
  const needsReview = results.filter((r) => r.status === 'needs_review').length;
  const canGenerate = needsReview === 0;

  // A single upload is exactly one order. Resolve results carry lineId =
  // String(index + 1); the email line items are in the same order.
  const order = useMemo(
    () => ({
      portalOrderRef: portalOrderRef(parsedData, filename),
      hasRef: hasRealRef(parsedData),
      filename,
      customer: parsedData?.billing_address?.company_name || '',
      currency,
      rows: results.map((r) => ({ result: r, item: lineItems[Number(r.lineId) - 1] || null })),
    }),
    [results, parsedData, filename, lineItems, currency]
  );

  const q = search.trim().toLowerCase();
  const visible = !q || order.portalOrderRef.toLowerCase().includes(q);

  return (
    <div className="screen active" id="s-review">
      <div className="rev-top">
        <h2>Review product matches</h2>
        <p>Confirm the website item number for each product before generating Excel.</p>
      </div>

      <div className="rev-summary">
        <div className="rev-stat">
          <div className="rev-stat-n">{total}</div>
          <div className="rev-stat-l">Products</div>
        </div>
        <div className="rev-stat is-approved">
          <div className="rev-stat-n">{approved}</div>
          <div className="rev-stat-l">Previously Approved</div>
        </div>
        <div className="rev-stat is-review">
          <div className="rev-stat-n">{needsReview}</div>
          <div className="rev-stat-l">Needs Review</div>
        </div>
      </div>

      <OrderSearchBar value={search} onChange={setSearch} matchCount={visible ? 1 : 0} totalCount={1} />

      {visible ? (
        <OrderReviewGroup
          order={order}
          onApprove={onApprove}
          comments={comments}
          onComment={onComment}
          fulfillment={fulfillment}
          onFulfillment={onFulfillment}
        />
      ) : (
        <div className="og-empty">No order matches “{search}”.</div>
      )}

      {!canGenerate && (
        <div className="rev-gate-note">
          {needsReview} product{needsReview > 1 ? 's' : ''} still need review before Excel can be generated.
        </div>
      )}

      <div className="rev-actions">
        <button className="btn-rst" onClick={onReset}>
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Process another file
        </button>
        <button className="btn-generate" onClick={onGenerate} disabled={!canGenerate}>
          <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          Generate Excel
        </button>
      </div>
    </div>
  );
}
