import { useState } from 'react';
import SearchProductModal from './SearchProductModal.jsx';
import { currencySymbol } from '../utils/format.js';

// One extracted product rendered as a table row.
//   • Yellow cells  = order detail extracted from the email (line item).
//   • Green cells   = website product matched from the catalog (resolve result).
//   • Actions cell  = Approve / Search for needs_review rows; read-only otherwise.
// Row-local state (chosen/busy/error/searchOpen) mirrors the former card.
export default function ReviewTableRow({ result, item, currency, onApprove }) {
  const approved = result.status === 'approved';
  const [chosen, setChosen] = useState(null); // product picked from search (overrides suggestion)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toFixed(2)}`;

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
      <td className="rt-match rt-mono">{candidate ? candidate.itemNo : '—'}</td>
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
