import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { catalogService } from '../services/catalogService.js';
import { validateManualProduct } from '../utils/manualProduct.js';

// "+ Add Product" modal (V1.6). Autocomplete over the Master Product Catalog
// (the same GET /v1/catalog/products endpoint the row-level Search uses), then
// a small form — Email Product Name / Quantity / Total Price — for the picked
// product. Used by BOTH the post-upload Review screen and the Saved-Order edit
// modal; sharing this component is what keeps the two flows identical.
//
// `existingItemNos` — Set of item numbers already approved in the order,
// shown as an informational "In order" tag on matching suggestions. Adding
// the same product again is ALLOWED (V1.9): each addition becomes its own
// independent order line. `onAdd(input)` — async; the parent appends +
// persists, and a rejection is shown inline here.
export default function AddProductModal({ existingItemNos, onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState(null); // { websiteProductName, itemNo }
  const [emailName, setEmailName] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  // Total Price is derived, never typed: Unit Price × Quantity, recomputed
  const computedTotal = (() => {
    const q = Number(qty);
    const u = String(unitPrice).trim() === '' ? 0 : Number(unitPrice);
    if (!Number.isFinite(q) || q < 0 || !Number.isFinite(u)) return null;
    return Math.round(u * q * 100) / 100;
  })();

  // Debounced (300 ms) autocomplete — never a DB query per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchError('');
      setLoading(false);
      return undefined;
    }
    setTouched(true);
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const resp = await catalogService.searchProducts(q, 15);
        setResults(resp.data);
        setSearchError('');
      } catch (e) {
        setSearchError(e.message || 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (r) => {
    setSelected({ websiteProductName: r.websiteProductName, itemNo: r.itemNo });
    // Email Product Name defaults to the Website Product Name (editable below).
    setEmailName(r.websiteProductName);
    setFormError('');
  };

  const changeSelection = () => {
    setSelected(null);
    setFormError('');
  };

  const submit = async () => {
    if (busy) return;
    const input = {
      websiteProductName: selected?.websiteProductName,
      itemNo: selected?.itemNo,
      emailProductName: emailName,
      qty,
      unitPrice,
    };
    const err = validateManualProduct(input);
    if (err) {
      setFormError(err);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await onAdd({
        websiteProductName: selected.websiteProductName,
        itemNo: selected.itemNo,
        emailProductName: emailName.trim(),
        qty: Number(qty),
        unitPrice, // may be '' — normalized to 0 by appendManualProduct
      });
      onClose();
    } catch (e) {
      setFormError(e.message || 'Could not add the product. Please try again.');
      setBusy(false);
    }
  };

  // Portalled to <body>: the screen container animates `transform`, which
  // would otherwise trap this fixed overlay inside it (partial-cover backdrop).
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add product to order" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Add Product to Order</div>
            <div className="modal-sub">Search the product catalog, then set quantity and price.</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close add product">
            ×
          </button>
        </div>

        {!selected ? (
          <>
            <input
              className="modal-search"
              type="text"
              autoFocus
              placeholder="Search by product name or item number…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search catalog by product name or item number"
            />
            <div className="modal-results">
              {loading && <div className="modal-note">Searching…</div>}
              {!loading && searchError && <div className="modal-note modal-error">{searchError}</div>}
              {!loading && !searchError && touched && query.trim() && results.length === 0 && (
                <div className="modal-note">No products found.</div>
              )}
              {!loading &&
                !searchError &&
                results.map((r) => {
                  const inOrder = existingItemNos?.has(String(r.itemNo));
                  return (
                    <button
                      key={`${r.itemNo}::${r.websiteProductName}`}
                      type="button"
                      className="modal-row"
                      onClick={() => pick(r)}
                      title={inOrder ? 'Already in this order — adding again creates a separate line' : undefined}
                    >
                      <span className="modal-row-name">{r.websiteProductName}</span>
                      <span className="modal-row-item">{inOrder ? `In order · Item ${r.itemNo}` : `Item ${r.itemNo}`}</span>
                    </button>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="apm-form">
            <div className="apm-selected">
              <span className="item-chip">{selected.itemNo}</span>
              <span className="apm-selected-name" title={selected.websiteProductName}>
                {selected.websiteProductName}
              </span>
              <button className="apm-change" type="button" onClick={changeSelection} disabled={busy}>
                Change
              </button>
            </div>

            <label className="apm-field">
              <span>Email Product Name</span>
              <input
                type="text"
                value={emailName}
                onChange={(e) => setEmailName(e.target.value)}
                aria-label="Email product name"
              />
            </label>

            <div className="apm-grid">
              <label className="apm-field">
                <span>Quantity</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  aria-label="Quantity"
                />
              </label>
              <label className="apm-field">
                <span>Unit Price (optional)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  aria-label="Unit price"
                />
              </label>
            </div>

            <div className="apm-total" aria-live="polite">
              <span>Total Price</span>
              <b>{computedTotal != null ? computedTotal.toFixed(2) : '—'}</b>
            </div>

            {formError && <div className="apm-error">{formError}</div>}

            <div className="apm-actions">
              <button className="apm-cancel" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="btn-approve" type="button" onClick={submit} disabled={busy}>
                {busy ? 'Adding…' : 'Add to Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
