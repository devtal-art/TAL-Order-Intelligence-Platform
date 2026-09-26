import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout.jsx';
import SortTh from '../components/SortableHeader.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import { buildOsPendingXLSX } from '../excel/buildOsPendingXLSX.js';
import { orderService } from '../services/orderService.js';

const SORTERS = {
  itemNo: (it) => Number(it.itemNo) || 0,
  product: (it) => (it.productName || '').toLowerCase(),
  pendingQty: (it) => it.totalPendingQty,
  orders: (it) => it.orders.length,
};

// OS Pending by Item (Dashboard "Item" card — new, additive). One row per
// item number that has at least one 'OS' (out of stock) line somewhere,
// with its total pending quantity across every order. Clicking a row opens
// a modal listing exactly which orders/customers make up that total — no
// second network call, since GET /v1/orders/dashboard/os-pending already
// returns each item's contributing orders inline.
//
// Filters + sort (URL-params-driven, same pattern as DashboardList.jsx/
// ActivityLogList.jsx so they survive a refresh/back-navigation):
//   q          — search by item number or product name, client-side only
//                (the full list is already in memory, so no round trip).
//   from / to  — Order Date range, sent to the server since it changes
//                which orders' lines get summed into each item's total.
//   sortBy/Dir — every column, client-side (same reasoning as search: the
//                whole list is already in memory).
export default function OsPendingList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const sortBy = params.get('sortBy') || 'pendingQty';
  const sortDir = params.get('sortDir') === 'asc' ? 'asc' : 'desc';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  // Refetched whenever an order gets edited through the View modal below —
  // an OS/Pending Qty edit changes the totals this page shows, so a save
  // shouldn't leave them stale (same reasoning DashboardList.jsx's own
  // refreshToken uses for its buckets).
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .osPendingByItem({ from: from || undefined, to: to || undefined })
      .then((r) => {
        if (!cancelled) setItems(r.data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load OS pending items.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshToken]);

  // View a single order (opens SavedOrderDetailModal) — identical wiring to
  // DashboardList.jsx's own openOrder.
  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');
  const openOrder = useCallback(async (ref) => {
    setViewBusyRef(ref);
    setError('');
    try {
      setViewOrder(await orderService.get(ref));
    } catch (e) {
      setError(e.message || `Could not open order ${ref}.`);
    } finally {
      setViewBusyRef('');
    }
  }, []);

  const setFilter = (key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const clearFilters = () => setParams({});
  const hasFilters = Boolean(q || from || to);

  // Clicking a header sorts by it (ascending first); clicking the same
  // header again flips direction — same behavior as DashboardList.jsx.
  const toggleSort = (column) => {
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sortBy', column);
      next.set('sortDir', nextDir);
      return next;
    });
  };

  const visibleItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? items.filter(
          (it) => it.itemNo.toLowerCase().includes(needle) || (it.productName || '').toLowerCase().includes(needle)
        )
      : items;

    const key = SORTERS[sortBy] || SORTERS.pendingQty;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [items, q, sortBy, sortDir]);

  // Export — builds the workbook from `visibleItems`, i.e. exactly what's
  // currently on screen, so Search/Order Date/sort are all already baked
  // in. No server round trip: the full filtered dataset is already in
  // memory client-side.
  const exportExcel = () => {
    const wb = buildOsPendingXLSX(visibleItems);
    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `OS Pending by Item ${dateStamp}.xlsx`, { bookType: 'xlsx', type: 'binary', cellStyles: true });
  };

  return (
    <Layout>
      <div className="screen active" id="s-os-pending-list">
        <div className="dl-head">
          <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          <h2 className="dl-title">
            <span className="cm-badge cm-os">OS</span>
            Pending Quantity by Item
          </h2>
          {!loading && (
            <span className="dl-total">
              {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}
            </span>
          )}
          <button
            className="sol-dl-btn"
            type="button"
            onClick={exportExcel}
            disabled={loading || visibleItems.length === 0}
            style={{ marginLeft: 'auto' }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export to Excel
          </button>
        </div>

        <div className="al-filters">
          <div className="al-filter-field al-filter-field--grow">
            <label htmlFor="op-search" className="al-filter-label">Search</label>
            <input
              id="op-search"
              type="text"
              className="sol-input"
              placeholder="Item number or product name…"
              value={q}
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </div>
          <div className="al-filter-field">
            <label htmlFor="op-from" className="al-filter-label">Order Date from</label>
            <input
              id="op-from"
              type="date"
              className="sol-input"
              value={from}
              onChange={(e) => setFilter('from', e.target.value)}
            />
          </div>
          <div className="al-filter-field">
            <label htmlFor="op-to" className="al-filter-label">Order Date to</label>
            <input
              id="op-to"
              type="date"
              className="sol-input"
              value={to}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          </div>
          {hasFilters && (
            <button className="sol-edit-btn" type="button" onClick={clearFilters}>Clear</button>
          )}
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading ? (
          <div className="dw-loading">Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div className="dl-empty">
            {hasFilters ? 'No items match these filters.' : 'No items currently have a pending OS quantity.'}
          </div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <SortTh column="itemNo" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Item No</SortTh>
                  <SortTh column="product" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Product</SortTh>
                  <SortTh column="pendingQty" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} numeric>Pending Qty</SortTh>
                  <SortTh column="orders" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} numeric>Orders</SortTh>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => (
                  <tr key={it.itemNo}>
                    <td className="dl-ref">{it.itemNo}</td>
                    <td>{it.productName || '—'}</td>
                    <td className="dl-num">{it.totalPendingQty}</td>
                    <td className="dl-num">{it.orders.length}</td>
                    <td className="dl-act">
                      <button className="dw-view" type="button" onClick={() => setDetailItem(it)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailItem && (
        <OsPendingDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onView={openOrder}
          viewBusyRef={viewBusyRef}
        />
      )}

      {viewOrder && (
        <SavedOrderDetailModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onDownload={() => downloadOrderExcel(viewOrder)}
          onSaved={(updated) => {
            setViewOrder(updated);
            setRefreshToken((t) => t + 1);
          }}
        />
      )}
    </Layout>
  );
}

function OsPendingDetailModal({ item, onClose, onView, viewBusyRef }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`OS pending orders for item ${item.itemNo}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Item {item.itemNo}</div>
            <div className="modal-sub">{item.productName || 'Orders with a pending OS quantity for this item'}</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="dl-table-wrap" style={{ padding: '0 20px 20px' }}>
          <table className="dl-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Pending Qty</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {item.orders.map((o, i) => (
                <tr key={`${o.portalOrderRef}-${i}`}>
                  <td className="dl-ref">{o.portalOrderRef}</td>
                  <td>{o.customerName || '—'}</td>
                  <td className="dl-num">{o.pendingQty}</td>
                  <td className="dl-act">
                    <button
                      className="dw-view"
                      type="button"
                      onClick={() => onView(o.portalOrderRef)}
                      disabled={viewBusyRef === o.portalOrderRef}
                    >
                      {viewBusyRef === o.portalOrderRef ? '…' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}
