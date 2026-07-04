import { useState } from 'react';
import * as XLSX from 'xlsx';
import { orderService } from '../services/orderService.js';
import { buildXLSX } from '../excel/buildXLSX.js';
import { statusMeta } from '../utils/order.js';
import { currencySymbol } from '../utils/format.js';

// Home-page lookup for previously processed orders (V1.2). Every uploaded HTML
// is saved to MongoDB keyed by Portal Order Ref No, so an order can be found
// again days/weeks later — searched here, viewed read-only, and its Excel
// regenerated from the stored parsed + resolution data.
export default function SavedOrderLookup() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = not searched yet; [] = no matches
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({}); // { [ref]: fullOrder }
  const [openRef, setOpenRef] = useState(null);
  const [busyRef, setBusyRef] = useState('');

  const runSearch = async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    setLoading(true);
    setError('');
    setOpenRef(null);
    try {
      const resp = await orderService.list(q);
      setResults(resp.data || []);
    } catch (err) {
      setError(err.message || 'Could not search saved orders.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  // Load full detail (parsed + resolution) for a ref, then toggle its panel.
  const toggle = async (ref) => {
    if (openRef === ref) {
      setOpenRef(null);
      return;
    }
    if (!details[ref]) {
      setBusyRef(ref);
      setError('');
      try {
        const full = await orderService.get(ref);
        setDetails((d) => ({ ...d, [ref]: full }));
      } catch (err) {
        setError(err.message || 'Could not load order detail.');
        setBusyRef('');
        return;
      }
      setBusyRef('');
    }
    setOpenRef(ref);
  };

  const download = (order) => {
    const parsed = order.parsedData || {};
    const resolution = order.resolutionData || { results: [] };
    const wb = buildXLSX(parsed, resolution);
    const inf = parsed.order_info || {};
    const fname = `Order_${inf.order_ref || order.portalOrderRef}_${(inf.order_date || '').replace(/\//g, '-') || 'data'}.xlsx`;
    XLSX.writeFile(wb, fname, { bookType: 'xlsx', type: 'binary', cellStyles: true });
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <section className="step-card sol-card" id="savedOrderLookup">
      <div className="step-head">
        <span className="step-badge sol-badge">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <div className="step-headings">
          <div className="step-title">Find a Saved Order</div>
          <div className="step-sub">Look up any previously processed order by its Portal Order Ref No.</div>
        </div>
      </div>

      <form className="sol-search" onSubmit={runSearch}>
        <input
          type="text"
          className="sol-input"
          placeholder="Enter Portal Order Ref No (e.g. 10025487)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="sol-btn" type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="sol-error">{error}</div>}

      {results !== null && !loading && (
        <div className="sol-results">
          {results.length === 0 ? (
            <div className="sol-empty">
              No saved order found{query.trim() ? ` for “${query.trim()}”` : ''}.
            </div>
          ) : (
            <>
              <div className="sol-results-hdr">
                {results.length} saved order{results.length > 1 ? 's' : ''} found
              </div>
              {results.map((o) => {
                const meta = statusMeta(o.resolutionStatus);
                const isOpen = openRef === o.portalOrderRef;
                const full = details[o.portalOrderRef];
                return (
                  <div key={o.id} className="sol-row-wrap">
                    <div className="sol-row">
                      <div className="sol-row-main">
                        <div className="sol-row-ref-line">
                          <span className="sol-row-ref">{o.portalOrderRef}</span>
                          <span className={`og-status og-status-${meta.tone}`}>{meta.label}</span>
                        </div>
                        <div className="sol-row-meta">
                          <span title={o.filename}>{o.filename || '—'}</span>
                          <span>· {o.customerName || 'No customer'}</span>
                          <span>· {o.totalProducts} products</span>
                          <span>· saved {fmtDate(o.uploadTimestamp)}</span>
                        </div>
                      </div>
                      <button
                        className="sol-view-btn"
                        type="button"
                        onClick={() => toggle(o.portalOrderRef)}
                        disabled={busyRef === o.portalOrderRef}
                      >
                        {busyRef === o.portalOrderRef ? 'Loading…' : isOpen ? 'Hide' : 'View'}
                      </button>
                    </div>

                    {isOpen && full && <SavedOrderDetail order={full} onDownload={() => download(full)} />}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Read-only detail: order metadata + the products with their stored resolution.
function SavedOrderDetail({ order, onDownload }) {
  const parsed = order.parsedData || {};
  const items = parsed.line_items || [];
  const results = order.resolutionData?.results || [];
  const sym = currencySymbol(parsed.financials?.currency);

  // resolve results carry lineId = String(index + 1); join back to line items.
  const rows = results.map((r) => {
    const item = items[Number(r.lineId) - 1] || null;
    const approved = r.status === 'approved';
    const matched = approved ? r.match : r.suggestedProduct;
    return {
      lineId: r.lineId,
      product: item ? item.description : r.emailProductName,
      qty: item ? item.qty : '—',
      total: item ? `${sym}${Number(item.total || 0).toFixed(2)}` : '—',
      itemNo: matched ? matched.itemNo : '—',
      website: matched ? matched.websiteProductName : '—',
      approved,
    };
  });

  return (
    <div className="sol-detail">
      <div className="sol-detail-top">
        <div className="sol-detail-meta">
          <span><b>Customer:</b> {order.customerName || '—'}</span>
          <span><b>Order date:</b> {order.orderDate || '—'}</span>
          <span><b>File:</b> {order.filename || '—'}</span>
        </div>
        <button className="sol-dl-btn" type="button" onClick={onDownload}>
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Excel
        </button>
      </div>

      <div className="rt-scroll">
        <table className="rt-table sol-table">
          <thead>
            <tr className="rt-cols">
              <th>Product (from email)</th>
              <th className="rt-num">QTY</th>
              <th className="rt-num">Total</th>
              <th>Item No</th>
              <th>Website Product</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.lineId} className="rt-row">
                <td className="rt-name">{row.product}</td>
                <td className="rt-num">{row.qty}</td>
                <td className="rt-num">{row.total}</td>
                <td className="rt-mono">{row.itemNo}</td>
                <td className="rt-name">{row.website}</td>
                <td>
                  <span className={`rt-badge ${row.approved ? 'approved' : 'needs'}`}>
                    {row.approved ? 'Approved' : 'Needs Review'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
