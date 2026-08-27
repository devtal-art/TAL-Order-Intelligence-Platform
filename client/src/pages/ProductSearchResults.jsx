import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ProductSearchBox from '../components/ProductSearchBox.jsx';
import { productLookupService } from '../services/productLookupService.js';

// Dedicated Product Search results page (V5.6 — flat list view). Reads the
// raw '#'-separated query straight from the URL (?q=...) so results are
// bookmarkable/shareable and survive a refresh. Every matched product across
// every search term renders as one row in a single list (not one card per
// term, V5.1's original layout) — a "Search Term" column ties each row back
// to the term that found it. Terms with no exact match are called out
// together in one validation summary at the bottom, instead of a separate
// empty card per term.
export default function ProductSearchResults() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [result, setResult] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!q.trim()) {
      setResult({ data: [], meta: { termCount: 0, matchedTermCount: 0 } });
      return;
    }
    setResult(null);
    productLookupService
      .lookup(q)
      .then((resp) => {
        if (!cancelled) setResult(resp);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not search products.');
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const groups = result?.data || [];
  const rows = groups.flatMap((g) => g.matches.map((m) => ({ ...m, term: g.term })));
  const invalidTerms = groups.filter((g) => g.matches.length === 0).map((g) => g.term);

  return (
    <Layout>
      <div className="screen active" id="s-product-search">
        <div className="dl-head">
          <Link className="dl-back" to="/search">← Back to Search</Link>
          <h2 className="dl-title">
            <span className="os-badge os-released">Product Search</span>
            Results
          </h2>
          {result && q.trim() && (
            <span className="dl-total">
              {rows.length} result{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <ProductSearchBox key={q} initialValue={q} autoFocus={!q.trim()} />

        {error && <div className="sol-error">{error}</div>}

        {!q.trim() ? (
          <div className="dl-empty">Enter a product name or item number above to search.</div>
        ) : result === null && !error ? (
          <div className="dw-loading">Searching…</div>
        ) : (
          <>
            {rows.length > 0 && (
              <div className="dl-table-wrap ps-list">
                <table className="dl-table">
                  <thead>
                    <tr>
                      <th>Search Term</th>
                      <th>Item No</th>
                      <th>Website Name</th>
                      <th>Email Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m, i) => (
                      <tr key={`${m.term}-${m.itemNo}-${i}`}>
                        <td><span className="ps-term-badge">{m.term}</span></td>
                        <td className="dl-ref">{m.itemNo}</td>
                        <td>{m.websiteProductName}</td>
                        <td>
                          {m.emailProductNames.length === 0 ? (
                            <span className="dl-muted">Not yet mapped</span>
                          ) : (
                            m.emailProductNames.join(', ')
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {groups.length > 0 && (
              <div className="ps-summary">
                <div className="ps-summary-line">
                  {result.meta.matchedTermCount} of {result.meta.termCount} search term
                  {result.meta.termCount === 1 ? '' : 's'} matched — {rows.length} result{rows.length === 1 ? '' : 's'} found.
                </div>
                {invalidTerms.length > 0 && (
                  <div className="sol-error">
                    No exact match for: {invalidTerms.join(', ')}. Check the spelling and try again — item number,
                    website name, and email name must match exactly.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
