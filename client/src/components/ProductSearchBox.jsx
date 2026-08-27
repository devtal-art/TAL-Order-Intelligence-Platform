import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bifurcatePastedText } from '../utils/searchTerms.js';

// Product Search box (V5.1) — search the catalog by website name, email
// name (from approved order mappings), or item number, without the user
// needing to say which one they're typing. Multiple terms in one search are
// separated by '#' with no surrounding space; pasting a column copied from
// Excel (newline- or tab-separated) is automatically rewritten into that
// format so the user never has to type the separators by hand. Enter (or
// the Search button) navigates to the dedicated results page.
export default function ProductSearchBox({ initialValue = '', autoFocus = false }) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const runSearch = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    navigate(`/search/products?q=${encodeURIComponent(q)}`);
  }, [value, navigate]);

  const handlePaste = useCallback(
    (e) => {
      const text = e.clipboardData.getData('text');
      if (!/[\r\n\t]/.test(text)) return; // single value — default paste behavior is fine
      e.preventDefault();
      const bifurcated = bifurcatePastedText(text);
      const input = inputRef.current;
      const start = input?.selectionStart ?? value.length;
      const end = input?.selectionEnd ?? value.length;
      const next = value.slice(0, start) + bifurcated + value.slice(end);
      setValue(next);
      const caret = start + bifurcated.length;
      requestAnimationFrame(() => {
        input?.setSelectionRange(caret, caret);
        input?.focus();
      });
    },
    [value]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    },
    [runSearch]
  );

  return (
    <section className="ps-box step-card" aria-label="Search products">
      <div className="ps-box-head">
        <div className="ro-title">Search Products</div>
        <div className="ro-sub">
          Search by website name, email name, or item number — no need to say which. Mix as many as you like,
          separated by #. Paste a column copied from Excel and it splits automatically.
        </div>
      </div>
      <div className="sol-search">
        <input
          ref={inputRef}
          type="text"
          className="sol-input"
          placeholder="e.g. Humza - Wholewheat Chapati Family Pack 900g (BOX6)#71472#71617"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
        />
        <button type="button" className="sol-btn" onClick={runSearch} disabled={!value.trim()}>
          Search
        </button>
      </div>
    </section>
  );
}
