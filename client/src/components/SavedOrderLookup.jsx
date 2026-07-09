import { useState } from 'react';
import * as XLSX from 'xlsx';
import { orderService } from '../services/orderService.js';
import { buildXLSX } from '../excel/buildXLSX.js';
import { statusMeta, commentMeta, deliveryMeta, DELIVERY_STATUSES, PRODUCT_COMMENTS, clampPendingQty } from '../utils/order.js';
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

                    {isOpen && full && (
                      <SavedOrderDetail
                        order={full}
                        onDownload={() => download(full)}
                        onSaved={(updated) => setDetails((d) => ({ ...d, [o.portalOrderRef]: updated }))}
                      />
                    )}
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

// Order detail: order metadata + the products with their stored resolution.
// Read-only except delivery tracking + comments — "Edit" switches ONLY the
// Pending Qty / Order Status / Comment cells to inputs; saving PATCHes just
// those fields and leaves everything else in the order untouched.
function SavedOrderDetail({ order, onDownload, onSaved }) {
  const parsed = order.parsedData || {};
  const items = parsed.line_items || [];
  const results = order.resolutionData?.results || [];
  const comments = order.productComments || {};
  const fulfillment = order.productFulfillment || {};
  const sym = currencySymbol(parsed.financials?.currency);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({}); // { [lineId]: { pendingQty, status } }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // resolve results carry lineId = String(index + 1) for single uploads and
  // "<orderIdx>-<index + 1>" for batch uploads — the email line index is
  // always the last hyphen-separated segment.
  const rows = results.map((r) => {
    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && items[lineIndex]) || null;
    const approved = r.status === 'approved';
    const matched = approved ? r.match : r.suggestedProduct;
    const f = fulfillment[r.lineId] || {};
    return {
      lineId: r.lineId,
      product: item ? item.description : r.emailProductName,
      qty: item ? item.qty : '—',
      orderedQty: item ? Number(item.qty) : NaN,
      total: item ? `${sym}${Number(item.total || 0).toFixed(2)}` : '—',
      itemNo: matched ? matched.itemNo : '—',
      website: matched ? matched.websiteProductName : '—',
      approved,
      comment: comments[r.lineId] || '',
      pendingQty: f.pendingQty,
      deliveryStatus: f.status || '',
    };
  });

  const startEdit = () => {
    const d = {};
    for (const row of rows) {
      d[row.lineId] = {
        pendingQty: row.pendingQty ?? '',
        status: row.deliveryStatus,
        comment: row.comment,
      };
    }
    setDraft(d);
    setSaveError('');
    setEditing(true);
  };

  const editLine = (lineId, patch) =>
    setDraft((d) => ({ ...d, [lineId]: { ...d[lineId], ...patch } }));

  const saveEdit = async () => {
    setSaving(true);
    setSaveError('');
    try {
      // Send every line's draft; ''/null fields clear the stored value.
      const fulfillmentPayload = {};
      const commentsPayload = {};
      for (const [lineId, f] of Object.entries(draft)) {
        fulfillmentPayload[lineId] = {
          pendingQty: f.pendingQty === '' ? null : Number(f.pendingQty),
          status: f.status || null,
        };
        commentsPayload[lineId] = f.comment || null;
      }
      await orderService.setFulfillment(order.portalOrderRef, fulfillmentPayload);
      const updated = await orderService.setComments(order.portalOrderRef, commentsPayload);
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setSaveError(e.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sol-detail">
      <div className="sol-detail-top">
        <div className="sol-detail-meta">
          <span><b>Customer:</b> {order.customerName || '—'}</span>
          <span><b>Order date:</b> {order.orderDate || '—'}</span>
          <span><b>File:</b> {order.filename || '—'}</span>
        </div>
        <div className="sol-detail-actions">
          {editing ? (
            <>
              <button className="sol-edit-btn" type="button" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button className="sol-save-btn" type="button" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button className="sol-edit-btn" type="button" onClick={startEdit}>
              <svg viewBox="0 0 24 24">
                <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
              Edit
            </button>
          )}
          <button className="sol-dl-btn" type="button" onClick={onDownload}>
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Excel
          </button>
        </div>
      </div>

      {saveError && <div className="sol-error">{saveError}</div>}

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
              <th className="rt-num">Pending Qty</th>
              <th>Order Status</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.lineId} className="rt-row">
                <td className="rt-name">{row.product}</td>
                <td className="rt-num">{row.qty}</td>
                <td className="rt-num">{row.total}</td>
                <td className="rt-itemno">
                  {row.itemNo && row.itemNo !== '—' ? (
                    <span className="item-chip">{row.itemNo}</span>
                  ) : (
                    <span className="rt-empty">—</span>
                  )}
                </td>
                <td className="rt-name">{row.website}</td>
                <td>
                  <span className={`rt-badge ${row.approved ? 'approved' : 'needs'}`}>
                    {row.approved ? 'Approved' : 'Needs Review'}
                  </span>
                </td>
                <td className="rt-num">
                  {editing ? (
                    Number.isInteger(row.orderedQty) ? (
                      <select
                        className="fl-select"
                        value={draft[row.lineId]?.pendingQty ?? ''}
                        onChange={(e) =>
                          editLine(row.lineId, { pendingQty: e.target.value === '' ? '' : Number(e.target.value) })
                        }
                        aria-label="Pending quantity"
                      >
                        <option value="">—</option>
                        {Array.from({ length: row.orderedQty + 1 }, (_, n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    ) : (
                      // Ordered quantity unknown (line item missing) — free numeric input.
                      <input
                        type="number"
                        className="fl-input"
                        value={draft[row.lineId]?.pendingQty ?? ''}
                        min={0}
                        step={1}
                        placeholder="—"
                        onChange={(e) =>
                          editLine(row.lineId, { pendingQty: clampPendingQty(e.target.value, row.orderedQty) })
                        }
                        aria-label="Pending quantity"
                      />
                    )
                  ) : row.pendingQty != null ? (
                    row.pendingQty
                  ) : (
                    <span className="rt-empty">—</span>
                  )}
                </td>
                <td>
                  {editing ? (
                    <select
                      className={`ds-select${draft[row.lineId]?.status ? ` is-${draft[row.lineId].status}` : ''}`}
                      value={draft[row.lineId]?.status || ''}
                      onChange={(e) => editLine(row.lineId, { status: e.target.value })}
                      aria-label="Order status"
                    >
                      <option value="">—</option>
                      {DELIVERY_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  ) : deliveryMeta(row.deliveryStatus) ? (
                    <span className={`ds-badge ds-${deliveryMeta(row.deliveryStatus).tone}`}>
                      {deliveryMeta(row.deliveryStatus).label}
                    </span>
                  ) : (
                    <span className="rt-empty">—</span>
                  )}
                </td>
                <td>
                  {editing ? (
                    <select
                      className="cm-select"
                      value={draft[row.lineId]?.comment || ''}
                      onChange={(e) => editLine(row.lineId, { comment: e.target.value })}
                      aria-label="Product comment"
                    >
                      <option value="">—</option>
                      {PRODUCT_COMMENTS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : commentMeta(row.comment) ? (
                    <span className={`cm-badge cm-${commentMeta(row.comment).tone}`}>
                      {commentMeta(row.comment).label}
                    </span>
                  ) : (
                    <span className="rt-empty">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
