import { useState, useMemo } from 'react';
import OrderReviewGroup from './OrderReviewGroup.jsx';
import OrderSearchBar from './OrderSearchBar.jsx';
import { portalOrderRef, hasRealRef } from '../utils/order.js';

// ──────────────────────────────────────────────────────────────────────────────
// BatchReviewView — Review screen for batch mode (V1.2, order-centric)
//
// Instead of a flat product list, orders are the primary unit: each uploaded
// HTML is one OrderReviewGroup (identity header + its product table). A single
// approval still resolves the product across EVERY order that contains it,
// because approvals are keyed by uniqueKey in the shared uniqueResults map.
// ──────────────────────────────────────────────────────────────────────────────
export default function BatchReviewView({ batchSession, uniqueResults, batchStats, onApprove, onGenerate, onReset }) {
  const [search, setSearch] = useState('');
  const { orders, parseErrors } = batchSession;

  // Build one order-view per parsed order. Each product row carries a result
  // whose lineId === uniqueKey, so ReviewTableRow's Approve delegates to the
  // batch hook's dedup-by-uniqueKey approval.
  const orderViews = useMemo(
    () =>
      orders.map((order, idx) => {
        const inf = order.parsedData.order_info || {};
        const items = order.parsedData.line_items || [];
        return {
          idx,
          portalOrderRef: portalOrderRef(order.parsedData, order.filename),
          hasRef: hasRealRef(order.parsedData),
          filename: order.filename,
          customer: order.parsedData.delivery_address?.company_name || order.parsedData.billing_address?.company_name || '',
          postcode: order.parsedData.delivery_address?.post_code || '',
          currency: order.parsedData.financials?.currency || 'GBP',
          orderDate: inf.order_date || '',
          rows: order.products.map((p, i) => {
            const r = uniqueResults[p.uniqueKey];
            const result = r
              ? { ...r, lineId: p.uniqueKey }
              : {
                  lineId: p.uniqueKey,
                  emailProductName: p.name,
                  status: 'needs_review',
                  confidence: 0,
                  source: 'none',
                  match: null,
                  suggestedProduct: null,
                };
            return { key: p.lineId, result, item: items[i] || null };
          }),
        };
      }),
    [orders, uniqueResults]
  );

  const q = search.trim().toLowerCase();
  const visibleOrders = q ? orderViews.filter((o) => o.portalOrderRef.toLowerCase().includes(q)) : orderViews;

  const {
    filesUploaded,
    ordersProcessed,
    totalProducts,
    uniqueProducts,
    previouslyApproved,
    needsReview,
    canGenerate,
  } = batchStats;

  return (
    <div className="screen active" id="s-batch-review">
      <div className="rev-top">
        <h2>Review Batch</h2>
        <p>Approve each product once — approvals apply across all orders that contain it.</p>
      </div>

      {/* ── 6-stat Summary ── */}
      <div className="batch-summary">
        <div className="batch-stat">
          <div className="batch-stat-n">{filesUploaded}</div>
          <div className="batch-stat-l">Files Uploaded</div>
        </div>
        <div className="batch-stat">
          <div className="batch-stat-n">{ordersProcessed}</div>
          <div className="batch-stat-l">Orders</div>
        </div>
        <div className="batch-stat">
          <div className="batch-stat-n">{totalProducts}</div>
          <div className="batch-stat-l">Products</div>
        </div>
        <div className="batch-stat">
          <div className="batch-stat-n">{uniqueProducts}</div>
          <div className="batch-stat-l">Unique Products</div>
        </div>
        <div className="batch-stat is-approved">
          <div className="batch-stat-n">{previouslyApproved}</div>
          <div className="batch-stat-l">Previously Approved</div>
        </div>
        <div className="batch-stat is-review">
          <div className="batch-stat-n">{needsReview}</div>
          <div className="batch-stat-l">Needs Review</div>
        </div>
      </div>

      {/* ── Parse errors (partial failures) ── */}
      {parseErrors.length > 0 && (
        <div className="batch-parse-errors">
          <div className="batch-parse-errors-title">
            ⚠ {parseErrors.length} file{parseErrors.length > 1 ? 's' : ''} could not be parsed and were skipped:
          </div>
          <ul className="batch-parse-errors-list">
            {parseErrors.map((e, i) => (
              <li key={i}><strong>{e.filename}</strong> — {e.error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Order search ── */}
      <OrderSearchBar
        value={search}
        onChange={setSearch}
        matchCount={visibleOrders.length}
        totalCount={orderViews.length}
      />

      {/* ── Order groups ── */}
      <div className="og-list">
        {visibleOrders.length === 0 ? (
          <div className="og-empty">No order matches “{search}”.</div>
        ) : (
          visibleOrders.map((order) => (
            <OrderReviewGroup
              key={order.idx}
              order={order}
              onApprove={onApprove}
              defaultOpen={ordersProcessed <= 5}
            />
          ))
        )}
      </div>

      {/* ── Gate note ── */}
      {!canGenerate && (
        <div className="rev-gate-note">
          {needsReview} unique product{needsReview > 1 ? 's' : ''} still need review before the ZIP can be generated.
        </div>
      )}

      {/* ── Actions ── */}
      <div className="rev-actions">
        <button className="btn-rst" onClick={onReset}>
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Process another batch
        </button>
        <button className="btn-generate" onClick={onGenerate} disabled={!canGenerate}>
          <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Generate ZIP ({ordersProcessed} Excel files)
        </button>
      </div>
    </div>
  );
}
