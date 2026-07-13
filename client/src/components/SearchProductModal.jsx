import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { catalogService } from '../services/catalogService.js';

// Searchable product picker. Live-filters the active catalog and, on selection,
// hands the chosen product back to the card (which drives the approval flow).
export default function SearchProductModal({ emailProductName, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError('');
      setLoading(false);
      return undefined;
    }
    setTouched(true);
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const resp = await catalogService.searchProducts(q, 10);
        setResults(resp.data);
        setError('');
      } catch (e) {
        setError(e.message || 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portalled to <body>: the screen container animates `transform`, which
  // would otherwise trap this fixed overlay inside it (partial-cover backdrop).
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Search products" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Search Another Product</div>
            <div className="modal-sub" title={emailProductName}>
              for “{emailProductName}”
            </div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close search">
            ×
          </button>
        </div>

        <input
          className="modal-search"
          type="text"
          autoFocus
          placeholder="Search by product name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search by product name"
        />

        <div className="modal-results">
          {loading && <div className="modal-note">Searching…</div>}
          {!loading && error && <div className="modal-note modal-error">{error}</div>}
          {!loading && !error && touched && query.trim() && results.length === 0 && (
            <div className="modal-note">No products found.</div>
          )}
          {!loading &&
            !error &&
            results.map((r) => (
              <button
                key={`${r.itemNo}::${r.websiteProductName}`}
                type="button"
                className="modal-row"
                onClick={() => onSelect({ websiteProductName: r.websiteProductName, itemNo: r.itemNo })}
              >
                <span className="modal-row-name">{r.websiteProductName}</span>
                <span className="modal-row-item">Item {r.itemNo}</span>
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
