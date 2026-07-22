import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { orderService } from '../services/orderService.js';
import { buildXLSX } from '../excel/buildXLSX.js';
import { statusMeta, commentMeta, deliveryMeta, DELIVERY_STATUSES, PRODUCT_COMMENTS, PROCESSED_BY_USERS, clampPendingQty } from '../utils/order.js';
import { approvedItemNos, appendManualProduct, removeManualProduct, remapAfterRemoval } from '../utils/manualProduct.js';
import { currencySymbol } from '../utils/format.js';
import AddProductModal from './AddProductModal.jsx';
import OrderFinancials from './OrderFinancials.jsx';

// Build and download the Excel workbook for a saved order DTO. Exported so
// the duplicate-upload flow (V1.9) can reuse it outside this component.
export function downloadOrderExcel(order) {
  const parsed = order.parsedData || {};
  const resolution = order.resolutionData || { results: [] };
  const comments = order.productComments || {};
  const wb = buildXLSX(parsed, resolution, comments);
  const inf = parsed.order_info || {};
  const fname = `Order_${inf.order_ref || order.portalOrderRef}_${(inf.order_date || '').replace(/\//g, '-') || 'data'}.xlsx`;
  XLSX.writeFile(wb, fname, { bookType: 'xlsx', type: 'binary', cellStyles: true });
}

// Saved-order lookup (V1.2; lives on the Dashboard page since V2.2). Every
// uploaded HTML is saved to MongoDB keyed by Portal Order Ref No, so an order
// can be found again days/weeks later — searched here, viewed read-only, and
// its Excel regenerated from the stored parsed + resolution data.
// `onOrderChanged` (V2.2, optional): called with the updated order DTO after
// any edit saved through this panel's detail modal, so the host page (the
// Dashboard) can refresh derived views. Purely additive — omitted, nothing changes.
export default function SavedOrderLookup({ onOrderChanged }) {
  const [searchType, setSearchType] = useState('ref'); // 'ref' | 'company'
  const [query, setQuery] = useState('');
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  
  const [results, setResults] = useState(null); // null = not searched yet; [] = no matches
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({}); // { [ref]: fullOrder }
  const [openRef, setOpenRef] = useState(null);
  const [busyRef, setBusyRef] = useState('');

  // Debounced autocomplete search
  useEffect(() => {
    if (searchType !== 'company') return;
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    
    let cancelled = false;
    setAutocompleteLoading(true);
    const timer = setTimeout(() => {
      orderService.autocompleteCompanies(q)
        .then(res => {
          if (!cancelled) {
            // The autocomplete endpoint returns a plain array, not { data: [...] }
            setSuggestions(Array.isArray(res) ? res : (res.data || []));
            setShowDropdown(true);
            setAutocompleteLoading(false);
          }
        })
        .catch(e => {
          if (!cancelled) {
            console.error('Autocomplete error:', e);
            setAutocompleteLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchType]);

  const runSearch = async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setOpenRef(null);
    setShowDropdown(false);
    try {
      const resp = searchType === 'company' ? await orderService.listByCompany(q) : await orderService.list(q);
      setResults(resp.data || []);
    } catch (err) {
      setError(err.message || 'Could not search saved orders.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = async (suggestion) => {
    setShowDropdown(false);
    setQuery(suggestion.companyName);
    
    if (suggestion.orderCount === 1) {
      openDetail(suggestion.latestOrderRef);
    } else {
      // List matching orders for the company
      setLoading(true);
      setError('');
      setOpenRef(null);
      try {
        const resp = await orderService.listByCompany(suggestion.companyName);
        setResults(resp.data || []);
      } catch (err) {
        setError(err.message || 'Could not search saved orders.');
        setResults(null);
      } finally {
        setLoading(false);
      }
    }
  };

  // Load full detail (parsed + resolution) for a ref, then open it in a modal.
  const openDetail = async (ref) => {
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

  const download = (order) => downloadOrderExcel(order);

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
          <div className="step-sub">Look up any previously processed order by its Portal Order Ref No or Company Name.</div>
        </div>
      </div>

      <form className="sol-search" onSubmit={runSearch}>
        <select 
          className="sol-search-type-select" 
          value={searchType} 
          onChange={e => {
            setSearchType(e.target.value);
            setQuery('');
            setResults(null);
            setShowDropdown(false);
          }}
          aria-label="Search Type"
        >
          <option value="ref">Order Number</option>
          <option value="company">Company Name</option>
        </select>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            className="sol-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder={searchType === 'ref' ? 'Enter Portal Order Ref No (e.g. 10025487)…' : 'Search Customer / Company Name…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (searchType === 'company' && query.trim() && suggestions.length > 0) {
                setShowDropdown(true);
              }
            }}
            onBlur={() => {
              // Delay hiding so clicking a suggestion works before onBlur fires
              setTimeout(() => setShowDropdown(false), 200);
            }}
          />
          {showDropdown && (
            <div className="sol-autocomplete-dropdown">
              {autocompleteLoading ? (
                <div className="sol-autocomplete-loading">Searching…</div>
              ) : suggestions.length === 0 ? (
                <div className="sol-autocomplete-loading">No companies found</div>
              ) : (
                suggestions.map(s => (
                  <div key={s.companyName} className="sol-autocomplete-item" onClick={() => handleSuggestionClick(s)}>
                    <span className="sol-autocomplete-name">{s.companyName}</span>
                    <span className="sol-autocomplete-meta">
                      <span>{s.orderCount} order{s.orderCount > 1 ? 's' : ''}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
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
                          {o.deliveryPostcode && <span>· {o.deliveryPostcode}</span>}
                          <span>· {o.totalProducts} products</span>
                          <span>· saved {fmtDate(o.uploadTimestamp)}</span>
                          <span className="sol-row-pb">
                            · <b>By:</b>
                            {o.processedBy ? (
                              <span className="sol-row-pb-name">{o.processedBy}</span>
                            ) : (
                              <span className="sol-row-pb-empty">Not Assigned</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        className="sol-view-btn"
                        type="button"
                        onClick={() => openDetail(o.portalOrderRef)}
                        disabled={busyRef === o.portalOrderRef}
                      >
                        {busyRef === o.portalOrderRef ? 'Loading…' : 'View'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {openRef && details[openRef] && (
        <SavedOrderDetailModal
          order={details[openRef]}
          onClose={() => setOpenRef(null)}
          onDownload={() => download(details[openRef])}
          onSaved={(updated) => {
            setDetails((d) => ({ ...d, [openRef]: updated }));
            if (onOrderChanged) onOrderChanged(updated);
          }}
        />
      )}
    </section>
  );
}

// Modal shell around the order detail: keeps the wide product table inside its
// own scroll container instead of stretching (and breaking) the page layout.
// Exported so the duplicate-upload flow (V1.9) can open an existing order
// directly, without a manual search.
export function SavedOrderDetailModal({ order, onClose, onDownload, onSaved }) {
  // Escape closes; the page behind must not scroll while the modal is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portalled to <body>: the screen container animates `transform`, which
  // would otherwise trap this fixed overlay inside it (partial-cover backdrop).
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal sol-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Saved order ${order.portalOrderRef}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Order {order.portalOrderRef}</div>
            <div className="modal-sub" title={order.filename}>{order.filename || '—'}</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close order detail">
            ×
          </button>
        </div>
        <div className="sol-modal-body">
          <SavedOrderDetail order={order} onDownload={onDownload} onSaved={onSaved} />
        </div>
      </div>
    </div>,
    document.body
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
  const notes = order.productNotes || {}; // older orders have no notes — empty (V1.7)
  const sym = currencySymbol(parsed.financials?.currency);

  // Order-level extras from the stored parsed snapshot (V1.8, display-only).
  // Older orders without them simply don't render the field/section.
  const additionalComment = String(parsed.order_info?.additional_comments || '').trim();
  const totalNum = Number(parsed.financials?.total);
  const orderTotal = Number.isFinite(totalNum) && totalNum > 0 ? `${sym}${totalNum.toFixed(2)}` : '';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({}); // { [lineId]: { pendingQty, status } }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Item numbers already approved in the order — informational "In order"
  // tag in the Add Product search (duplicates are allowed, V1.9).
  const existingItemNos = useMemo(() => approvedItemNos(results), [results]);

  // Manually add one catalog product to this saved order (V1.6). Appends the
  // line + an already-approved result (catalog product → Approved, 100%) via
  // the shared helper the Review screen also uses, then re-persists through
  // the existing order upsert. Comments and fulfilment entries are siblings of
  // the snapshots, so they are untouched. Errors surface inside the modal.
  const addProduct = async (input) => {
    const appended = appendManualProduct(parsed, order.resolutionData || { results: [] }, input);
    const updated = await orderService.save({
      portalOrderRef: order.portalOrderRef,
      filename: order.filename || '',
      customerName: order.customerName || '',
      orderDate: order.orderDate || '',
      totalProducts: appended.parsed.line_items.length,
      parsedData: appended.parsed,
      resolutionData: appended.resolution,
    });
    onSaved(updated);
  };

  const [deletingId, setDeletingId] = useState('');

  // Processed By is set only at order creation time (Review screen Save
  // workflow, V2.0) and is immutable afterwards — no assignment or edit
  // function is exposed here.

  // Remove one MANUALLY ADDED product from this saved order (V1.7) — the
  // shared helper refuses HTML-parsed lines, so only manual additions can go.
  // Later manual lines are renumbered; entries in the lineId-keyed maps
  // (comments/fulfillment/notes) are moved via the PATCH endpoints AFTER the
  // snapshot save, so server-side validation reads the updated line items.
  const removeProduct = async (lineId) => {
    const removed = removeManualProduct(parsed, order.resolutionData || { results: [] }, lineId);
    if (!removed) return;
    setDeletingId(lineId);
    setSaveError('');
    try {
      const cm = remapAfterRemoval(comments, lineId, removed.remap);
      const fl = remapAfterRemoval(fulfillment, lineId, removed.remap, ['pendingQty', 'status']);
      const nt = remapAfterRemoval(notes, lineId, removed.remap);

      let updated = await orderService.save({
        portalOrderRef: order.portalOrderRef,
        filename: order.filename || '',
        customerName: order.customerName || '',
        orderDate: order.orderDate || '',
        totalProducts: removed.parsed.line_items.length,
        parsedData: removed.parsed,
        resolutionData: removed.resolution,
      });
      if (Object.keys(cm.patch).length) updated = await orderService.setComments(order.portalOrderRef, cm.patch);
      if (Object.keys(fl.patch).length) updated = await orderService.setFulfillment(order.portalOrderRef, fl.patch);
      if (Object.keys(nt.patch).length) updated = await orderService.setNotes(order.portalOrderRef, nt.patch);
      onSaved(updated);
    } catch (e) {
      setSaveError(e.message || 'Could not remove the product.');
    } finally {
      setDeletingId('');
    }
  };

  // resolve results carry lineId = String(index + 1) for single uploads and
  // "<orderIdx>-<index + 1>" for batch uploads — the email line index is
  // always the last hyphen-separated segment.
  const rows = useMemo(() => results.map((r) => {
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
      unitPrice: item ? `${Number(item.unit_price) < 0 ? '-' : ''}${sym}${Math.abs(Number(item.unit_price || 0)).toFixed(2)}` : '—',
      isUnitPriceNegative: item && Number(item.unit_price) < 0,
      itemNo: matched ? matched.itemNo : '—',
      website: matched ? matched.websiteProductName : '—',
      approved,
      manual: r.source === 'manual_addition', // only these lines are deletable (V1.7)
      comment: comments[r.lineId] || '',
      note: notes[r.lineId] || '',
      pendingQty: f.pendingQty,
      deliveryStatus: f.status || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results/items/fulfillment/comments/sym all derive from `order`
  }), [order]);

  // Delivery summary: how many products sit in each Order Status. Derived
  // live — from the draft while editing (so changing a dropdown updates the
  // badges instantly), from the stored values otherwise. Products without a
  // status are not counted; statuses with a count of zero are not rendered.
  const statusCounts = useMemo(() => {
    const counts = { delivered: 0, half_delivered: 0, not_delivered: 0 };
    for (const row of rows) {
      const s = editing ? draft[row.lineId]?.status : row.deliveryStatus;
      if (s && counts[s] !== undefined) counts[s] += 1;
    }
    return counts;
  }, [rows, editing, draft]);
  const hasStatuses = Object.values(statusCounts).some((n) => n > 0);
  // The remove column only exists when the order has manually added lines, so
  // orders without them render exactly as before (V1.7).
  const hasManual = rows.some((r) => r.manual);

  const startEdit = () => {
    const d = {};
    for (const row of rows) {
      d[row.lineId] = {
        pendingQty: row.pendingQty ?? '',
        status: row.deliveryStatus,
        comment: row.comment,
        note: row.note,
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
      const notesPayload = {};
      for (const [lineId, f] of Object.entries(draft)) {
        fulfillmentPayload[lineId] = {
          pendingQty: f.pendingQty === '' ? null : Number(f.pendingQty),
          status: f.status || null,
        };
        commentsPayload[lineId] = f.comment || null;
        notesPayload[lineId] = f.note?.trim() || null;
      }
      await orderService.setFulfillment(order.portalOrderRef, fulfillmentPayload);
      await orderService.setComments(order.portalOrderRef, commentsPayload);
      const updated = await orderService.setNotes(order.portalOrderRef, notesPayload);
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
          <span><b>Postcode:</b> {order.deliveryPostcode || parsed.delivery_address?.post_code || '—'}</span>
          <span><b>Order date:</b> {order.orderDate || '—'}</span>
          <span><b>File:</b> {order.filename || '—'}</span>
          {orderTotal && <span><b>Order Total:</b> {orderTotal}</span>}
          <span className="sol-pb">
            <b>Processed By:</b>
            {order.processedBy ? (
              // Assigned — immutable. Display as locked pill.
              <span className="pb-locked" title="Processed By is fixed at order creation and cannot be changed">
                {order.processedBy}
                <svg
                  className="pb-lock-icon"
                  viewBox="0 0 24 24"
                  aria-label="Locked"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            ) : (
              // Not assigned — read-only plain text. Processed By can only be
              // set at order creation time via the Review screen Save workflow.
              <span className="pb-not-assigned" title="Processed By was not set when this order was created">
                Not Assigned
              </span>
            )}
          </span>
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
            <>
              <button className="sol-edit-btn" type="button" onClick={() => setAddOpen(true)}>
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Product
              </button>
              <button className="sol-edit-btn" type="button" onClick={startEdit}>
                <svg viewBox="0 0 24 24">
                  <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
                </svg>
                Edit
              </button>
            </>
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

      {additionalComment && (
        <div className="oc-note" role="note" aria-label="Order additional comment">
          <div className="oc-note-title">Additional Comment</div>
          <div className="oc-note-text">{additionalComment}</div>
        </div>
      )}

      {hasStatuses && (
        <div className="sol-status-summary" aria-label="Delivery status summary">
          {DELIVERY_STATUSES.map(({ value }) => {
            const count = statusCounts[value];
            if (!count) return null;
            const meta = deliveryMeta(value);
            return (
              <span key={value} className={`ds-badge ds-${meta.tone}`}>
                {count} {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {saveError && <div className="sol-error">{saveError}</div>}

      <div className="rt-scroll">
        <table className="rt-table sol-table">
          <thead>
            <tr className="rt-cols">
              <th>Product (from email)</th>
              <th className="rt-num">QTY</th>
              <th className="rt-num">Unit Price</th>
              <th>Item No</th>
              <th>Website Product</th>
              <th>Status</th>
              <th className="rt-num">Pending Qty</th>
              <th>Order Status</th>
              <th>Comment</th>
              <th>Additional Comment</th>
              {hasManual && <th aria-label="Remove product" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const released = draft[row.lineId]?.comment === 'Released';
              return (
                <tr key={row.lineId} className="rt-row">
                  <td className="rt-name">{row.product}</td>
                  <td className="rt-num">{row.qty}</td>
                  <td className={`rt-num${row.isUnitPriceNegative ? ' price-negative' : ''}`}>{row.unitPrice}</td>
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
                          disabled={released}
                          title={released ? 'Not applicable when comment is Released' : undefined}
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
                          disabled={released}
                          title={released ? 'Not applicable when comment is Released' : undefined}
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
                        disabled={released}
                        title={released ? 'Not applicable when comment is Released' : undefined}
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
                  <td className="rt-note">
                    {editing ? (
                      <textarea
                        className="note-input"
                        rows={1}
                        placeholder="Add note…"
                        value={draft[row.lineId]?.note ?? ''}
                        onChange={(e) => editLine(row.lineId, { note: e.target.value })}
                        aria-label="Additional comment"
                      />
                    ) : row.note ? (
                      <span className="note-text" title={row.note}>{row.note}</span>
                    ) : (
                      <span className="rt-empty">—</span>
                    )}
                  </td>
                  {hasManual && (
                    <td className="rt-del-cell">
                      {row.manual && !editing && (
                        <button
                          className="rt-del"
                          type="button"
                          title="Remove manually added product"
                          aria-label="Remove manually added product"
                          onClick={() => removeProduct(row.lineId)}
                          disabled={deletingId === row.lineId}
                        >
                          {deletingId === row.lineId ? '…' : '🗑'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <OrderFinancials 
        financials={parsed.financials} 
        results={results}
        lineItems={items}
        comments={comments}
      />

      {addOpen && (
        <AddProductModal
          existingItemNos={existingItemNos}
          onAdd={addProduct}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
