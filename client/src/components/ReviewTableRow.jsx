import { useState } from 'react';
import SearchProductModal from './SearchProductModal.jsx';
import { currencySymbol } from '../utils/format.js';
import { PRODUCT_COMMENTS, DELIVERY_STATUSES, clampPendingQty } from '../utils/order.js';

// One extracted product rendered as a table row.
//   • Yellow cells  = order detail extracted from the email (line item).
//   • Green cells   = website product matched from the catalog (resolve result).
//   • Actions cell  = Approve / Search for needs_review rows; read-only otherwise.
// Row-local state (chosen/busy/error/searchOpen) mirrors the former card.
//
// `comment` + `onComment` (V1.3, optional): when `onComment` is provided the
// row gets a Comment selector (Released / OS / N/A) saved with the order.
//
// `fulfillment` + `onFulfillment` (V1.4, optional): when `onFulfillment` is
// provided the row gets delivery tracking — a Pending Qty input (0 ≤ n ≤ the
// line's ordered quantity) and an Order Status selector — saved with the order.
export default function ReviewTableRow({ result, item, currency, onApprove, comment = '', onComment, fulfillment, onFulfillment }) {
  const approved = result.status === 'approved';
  const [chosen, setChosen] = useState(null); // product picked from search (overrides suggestion)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toFixed(2)}`;

  // Ordered quantity of this line — the Pending Qty upper bound. When known,
  // Pending Qty renders as a 0..qty dropdown so invalid values can't be typed.
  const orderedQty = item && Number.isInteger(Number(item.qty)) ? Number(item.qty) : null;

  // The website product this row represents: approved match, searched pick, or engine suggestion.
  const candidate = approved ? result.match : chosen || result.suggestedProduct || null;
  const matchScore = approved ? 100 : candidate && candidate.matchScore != null ? candidate.matchScore : null;

  const doApprove = async () => {
    if (busy || !candidate) return; // prevent duplicate submissions
    setBusy(true);
    setError('');
    try {
      await onApprove(result.lineId, {
        emailProductName: result.emailProductName,
        websiteProductName: candidate.websiteProductName,
        itemNo: candidate.itemNo,
      });
      // On success the parent replaces this result → row re-renders as approved.
    } catch (e) {
      setError(e.message || 'Approval failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <tr className={approved ? 'rt-row is-approved' : 'rt-row is-review'}>
      {/* ── Email (yellow) ── */}
      <td className="rt-email rt-name" title={item ? item.description : result.emailProductName}>
        {item ? item.description : result.emailProductName}
      </td>
      <td className="rt-email">{item ? item.package : '—'}</td>
      <td className="rt-email rt-num">{item ? item.qty : '—'}</td>
      <td className="rt-email rt-num">{item ? money(item.unit_price) : '—'}</td>
      <td className="rt-email rt-num">{item ? money(item.total) : '—'}</td>

      {/* ── Match (green) ── */}
      <td className="rt-match rt-itemno">
        {candidate ? <span className="item-chip">{candidate.itemNo}</span> : <span className="rt-empty">—</span>}
      </td>
      <td className="rt-match rt-name" title={candidate ? candidate.websiteProductName : ''}>
        {candidate ? candidate.websiteProductName : <span className="rt-empty">No match</span>}
      </td>
      <td className="rt-match rt-num">
        {matchScore != null ? <span className={`rt-score ${approved ? 'is-full' : ''}`}>{matchScore}%</span> : '—'}
      </td>
      <td className="rt-match">
        <span className={`rt-badge ${approved ? 'approved' : 'needs'}`}>
          {approved ? 'Approved' : 'Needs Review'}
        </span>
      </td>

      {/* ── Delivery tracking (V1.4, only when the flow supports it) ── */}
      {onFulfillment && (
        <>
          <td className="rt-fulfil rt-num">
            {orderedQty != null ? (
              <select
                className="fl-select"
                value={fulfillment?.pendingQty ?? ''}
                onChange={(e) => onFulfillment(result.lineId, { pendingQty: e.target.value === '' ? '' : Number(e.target.value) })}
                aria-label="Pending quantity"
              >
                <option value="">—</option>
                {Array.from({ length: orderedQty + 1 }, (_, n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            ) : (
              // Ordered quantity unknown (line item missing) — free numeric input.
              <input
                type="number"
                className="fl-input"
                value={fulfillment?.pendingQty ?? ''}
                min={0}
                step={1}
                placeholder="—"
                onChange={(e) => onFulfillment(result.lineId, { pendingQty: clampPendingQty(e.target.value, item?.qty) })}
                aria-label="Pending quantity"
              />
            )}
          </td>
          <td className="rt-fulfil">
            <select
              className={`ds-select${fulfillment?.status ? ` is-${fulfillment.status}` : ''}`}
              value={fulfillment?.status ?? ''}
              onChange={(e) => onFulfillment(result.lineId, { status: e.target.value || null })}
              aria-label="Order status"
            >
              <option value="">—</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </td>
        </>
      )}

      {/* ── Comment (V1.3, only when the flow supports it) ── */}
      {onComment && (
        <td className="rt-comment">
          <select
            className="cm-select"
            value={comment}
            onChange={(e) => onComment(result.lineId, e.target.value)}
            aria-label="Product comment"
          >
            <option value="">—</option>
            {PRODUCT_COMMENTS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </td>
      )}

      {/* ── Actions ── */}
      <td className="rt-actions">
        {approved ? (
          <span className="rt-done">✓ Confirmed</span>
        ) : (
          <div className="rt-actions-wrap">
            <div className="rt-btns">
              <button className="btn-search" type="button" onClick={() => setSearchOpen(true)} disabled={busy}>
                Search
              </button>
              <button className="btn-approve" type="button" onClick={doApprove} disabled={!candidate || busy}>
                {busy ? 'Approving…' : 'Approve'}
              </button>
            </div>
            {error && <div className="rt-error">{error}</div>}
          </div>
        )}
        {searchOpen && (
          <SearchProductModal
            emailProductName={result.emailProductName}
            onSelect={(product) => {
              setChosen(product);
              setSearchOpen(false);
              setError('');
            }}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </td>
    </tr>
  );
}
