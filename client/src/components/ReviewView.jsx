import { useState, useMemo } from 'react';
import OrderReviewGroup from './OrderReviewGroup.jsx';
import OrderSearchBar from './OrderSearchBar.jsx';
import AddProductModal from './AddProductModal.jsx';
import OrderFinancials from './OrderFinancials.jsx';
import { portalOrderRef, hasRealRef, isMatchingSkipped, ORDER_STATUSES } from '../utils/order.js';
import { approvedItemNos } from '../utils/manualProduct.js';
import { currencySymbol } from '../utils/format.js';
import { toDateInputValue, fromDateInputValue } from '../utils/dateFormat.js';
import { useAuth } from '../context/AuthContext.jsx';

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
  notes = {},
  onApprove,
  onAddProduct,
  onRemoveProduct,
  onComment,
  onFulfillment,
  onNote,
  onSave,        // V2.0 — called when user clicks Save Order
  saved = false, // V2.0 — true once the order has been written to the DB
  orderStatus = '',        // V3.2 — required before Save
  onOrderStatus,           // V3.2
  orderComment = '',       // V3.2 — optional
  onOrderComment,          // V3.2
  deliveryDate = '',       // V4.2 — optional, always editable (even after Save)
  onDeliveryDate,          // V4.2
  saveError = '',          // V3.2 — surfaced when Save fails
  onGenerate,
  onReset,
}) {
  // The authenticated user is automatically the processor (V3.0 — JWT Auth).
  // No manual selection is required or permitted.
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Item numbers already approved in the order — informational "In order"
  // tag in the Add Product search (duplicates are allowed, V1.9).
  const existingItemNos = useMemo(() => approvedItemNos(results), [results]);

  // Order-level extras already produced by the parser (V1.8, display-only):
  // the customer's Additional Comment and the parsed Order Total. Both are
  // optional — absent/zero values render nothing.
  const additionalComment = String(parsedData?.order_info?.additional_comments || '').trim();
  const totalNum = Number(parsedData?.financials?.total);
  const orderTotal = Number.isFinite(totalNum) && totalNum > 0 ? `${currencySymbol(currency)}${totalNum.toFixed(2)}` : '';

  const total = results.length;
  const approved = results.filter((r) => r.status === 'approved').length;
  const needsReview = results.filter((r) => r.status === 'needs_review').length;
  // Unresolved products explicitly marked 'Not Found' (V2.1) don't block the
  // order: matching was intentionally skipped for them, so they can't be
  // approved — requiring approval would make the order unsaveable. They still
  // show in the Needs Review count above (matching genuinely didn't happen).
  const blockingReview = results.filter(
    (r) => r.status === 'needs_review' && !isMatchingSkipped(comments[r.lineId])
  ).length;
  // Save is enabled once all products are resolved (or intentionally skipped
  // via 'Not Found') AND an Order Status has been selected (V3.2, required).
  // Processed By is now automatic (JWT user) — no gate needed.
  // Generate is enabled only after the order has been explicitly saved (V2.0).
  const canSave = !saved && blockingReview === 0 && !!orderStatus;
  const canGenerate = saved && blockingReview === 0;

  // A single upload is exactly one order. Resolve results carry lineId =
  // String(index + 1); the email line items are in the same order.
  const order = useMemo(
    () => ({
      portalOrderRef: portalOrderRef(parsedData, filename),
      hasRef: hasRealRef(parsedData),
      filename,
      customer: parsedData?.delivery_address?.company_name || parsedData?.billing_address?.company_name || '',
      postcode: parsedData?.delivery_address?.post_code || '',
      currency,
      orderTotal,
      rows: results.map((r) => ({ result: r, item: lineItems[Number(r.lineId) - 1] || null })),
    }),
    [results, parsedData, filename, lineItems, currency, orderTotal]
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

      {additionalComment && (
        <div className="oc-note" role="note" aria-label="Order additional comment">
          <div className="oc-note-title">Additional Comment</div>
          <div className="oc-note-text">{additionalComment}</div>
        </div>
      )}

      <OrderSearchBar value={search} onChange={setSearch} matchCount={visible ? 1 : 0} totalCount={1} />

      {/* Processed By (V3.0): automatically set from the authenticated user.
           The badge is always shown — locked before and after save. */}
      <div className="apm-bar">
        <div className="pb-field">
          <span className="pb-label">Processed By</span>
          <span className="pb-locked" title="Automatically assigned to the logged-in user">
            {user?.name || '—'}
            <svg className="pb-lock-icon" viewBox="0 0 24 24" aria-label="Auto-assigned">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
        </div>
        {onAddProduct && (
          <button className="btn-add-product" type="button" onClick={() => setAddOpen(true)}>
            <svg viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Product
          </button>
        )}
      </div>

      {visible ? (
        <OrderReviewGroup
          order={order}
          onApprove={onApprove}
          comments={comments}
          onComment={onComment}
          fulfillment={fulfillment}
          onFulfillment={onFulfillment}
          notes={notes}
          onNote={onNote}
          onRemove={onRemoveProduct}
        />
      ) : (
        <div className="og-empty">No order matches “{search}”.</div>
      )}

      <OrderFinancials
        financials={parsedData?.financials}
        results={results}
        lineItems={lineItems}
        comments={comments}
      />

      {!saved && (
        <div className="os-edit-block" aria-label="Overall order status and comment">
          <div className="os-edit-field">
            <label className="os-edit-label" htmlFor="review-order-status">Order Status</label>
            <select
              id="review-order-status"
              className="os-select"
              value={orderStatus}
              onChange={(e) => onOrderStatus(e.target.value)}
              aria-label="Order Status"
              required
            >
              <option value="" disabled>Select…</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="os-edit-field">
            <label className="os-edit-label" htmlFor="review-delivery-date">Delivery Date</label>
            <input
              id="review-delivery-date"
              type="date"
              className="os-select"
              value={toDateInputValue(deliveryDate)}
              onChange={(e) => onDeliveryDate(fromDateInputValue(e.target.value))}
              aria-label="Delivery Date"
            />
          </div>
          <div className="os-edit-field os-edit-field--wide">
            <label className="os-edit-label" htmlFor="review-order-comment">Order Comment</label>
            <textarea
              id="review-order-comment"
              className="os-comment-input"
              rows={2}
              placeholder="Optional order-level comment…"
              value={orderComment}
              onChange={(e) => onOrderComment(e.target.value)}
              aria-label="Order Comment"
            />
          </div>
        </div>
      )}

      {saveError && <div className="rev-gate-note">{saveError}</div>}
      {blockingReview > 0 && (
        <div className="rev-gate-note">
          {`${blockingReview} product${blockingReview > 1 ? 's' : ''} still need${blockingReview === 1 ? 's' : ''} review before the order can be saved.`}
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

        <div className="rev-save-group">
          {saved ? (
            <>
              <span className="rev-saved-badge" aria-label="Order saved">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved
              </span>
              <button className="btn-generate" onClick={onGenerate} disabled={!canGenerate}>
                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                Generate Excel
              </button>
            </>
          ) : (
            <button
              className="btn-save"
              onClick={onSave}
              disabled={!canSave}
              title={!orderStatus && blockingReview === 0 ? 'Select an Order Status before saving' : undefined}
            >
              <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Order
            </button>
          )}
        </div>
      </div>

      {addOpen && (
        <AddProductModal
          existingItemNos={existingItemNos}
          onAdd={onAddProduct}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
