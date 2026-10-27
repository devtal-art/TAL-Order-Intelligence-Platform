import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import SavedOrderLookup, { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import ProductSearchBox from '../components/ProductSearchBox.jsx';
import SortTh from '../components/SortableHeader.jsx';
import LitInvoiceDot from '../components/LitInvoiceDot.jsx';
import { orderService } from '../services/orderService.js';
import { statusMeta } from '../utils/order.js';

const RECENT_LIMIT = 5;

// Search page (V2.3): the Saved Order Search on top, and beneath it the
// latest processed orders — one click from landing here to reopening what
// the team worked on most recently. View opens the detail modal directly.
export default function Search() {
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = useCallback(() => setRefreshToken((t) => t + 1), []);

  return (
    <Layout>
      <div className="screen active" id="s-search">
        <div className="dbp-top">
          <h2>Search Orders</h2>
          <p>Look up any saved order by its Portal Order Ref No, or jump back into a recent one.</p>
        </div>

        <div className="sp-search">
          <SavedOrderLookup onOrderChanged={bump} />
        </div>

        <div className="sp-search">
          <ProductSearchBox />
        </div>

        <RecentOrders refreshToken={refreshToken} onChanged={bump} />
      </div>
    </Layout>
  );
}

// "Recent Processed Orders" — the latest saved orders (summaries only),
// fetched with a server-side cap so the browser never loads the whole
// collection. Re-fetches whenever `refreshToken` changes.
function RecentOrders({ refreshToken, onChanged }) {
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState('');

  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');

  // Only 5 rows are ever loaded here, so sorting is done entirely client-side
  // — no server round trip needed. 'orderDate' sorts by the actual date shown
  // in that column (DD/MM/YYYY), rearranged to YYYYMMDD so it sorts
  // chronologically — a plain string/Date sort on order_date would put
  // "22/06/2026" before "16/08/2026", and uploadTimestamp is a DIFFERENT
  // field (when the order was saved, not the order's own date) that can
  // legitimately disagree with it.
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const toggleSort = (column) => {
    setSortDir((d) => (sortBy === column && d === 'asc' ? 'desc' : 'asc'));
    setSortBy(column);
  };
  const orderDateSortKey = (o) => {
    const d = o.orderDate || '';
    return d.length === 10 ? `${d.slice(6, 10)}${d.slice(3, 5)}${d.slice(0, 2)}` : '';
  };
  const SORT_KEYS = {
    ref: (o) => Number(o.portalOrderRef) || 0,
    customer: (o) => (o.customerName || '').toLowerCase(),
    processedBy: (o) => (o.processedBy || '').toLowerCase(),
    orderDate: orderDateSortKey,
    products: (o) => o.totalProducts || 0,
  };
  const sortedRows = useMemo(() => {
    if (!rows || !sortBy) return rows;
    const keyFn = SORT_KEYS[sortBy];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const ka = keyFn(a);
      const kb = keyFn(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SORT_KEYS is a stable literal
  }, [rows, sortBy, sortDir]);
  useEffect(() => {
    let cancelled = false;
    setError('');
    orderService
      .recent(RECENT_LIMIT)
      .then((resp) => {
        // Hard cap client-side too — a backend that predates the ?limit=
        // param returns the full list, and this section must only ever show
        // the latest few.
        if (!cancelled) setRows((resp.data || []).slice(0, RECENT_LIMIT));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load recent orders.');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

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

  return (
    <section className="ro-card" aria-label="Recent processed orders">
      <div className="ro-head">
        <div className="ro-title">Recent Processed Orders</div>
        <div className="ro-sub">The last {RECENT_LIMIT} orders saved to the platform</div>
      </div>

      {error && <div className="sol-error">{error}</div>}

      {rows === null ? (
        <div className="dw-loading">Loading recent orders…</div>
      ) : rows.length === 0 ? (
        <div className="dl-empty">No orders saved yet — process one on Upload &amp; Save.</div>
      ) : (
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th className="dl-lit" aria-label="Lit Invoice" />
                <SortTh column="ref" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order #</SortTh>
                <SortTh column="customer" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Customer</SortTh>
                <SortTh column="processedBy" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Processed By</SortTh>
                <SortTh column="orderDate" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order Date</SortTh>
                <th>Status</th>
                <SortTh column="products" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} numeric>Products</SortTh>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((o) => {
                const meta = statusMeta(o.resolutionStatus);
                return (
                  <tr key={o.id}>
                    <td className="dl-lit"><LitInvoiceDot on={o.litInvoice} /></td>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.customerName || '—'}</td>
                    <td>{o.processedBy || <span className="dl-muted">Not Assigned</span>}</td>
                    <td>{o.orderDate || '—'}</td>
                    <td>
                      <span className={`og-status og-status-${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td className="dl-num">{o.totalProducts}</td>
                    <td className="dl-act">
                      <button
                        className="dw-view"
                        type="button"
                        onClick={() => openOrder(o.portalOrderRef)}
                        disabled={viewBusyRef === o.portalOrderRef}
                      >
                        {viewBusyRef === o.portalOrderRef ? '…' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewOrder && (
        <SavedOrderDetailModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onDownload={() => downloadOrderExcel(viewOrder)}
          onSaved={(updated) => {
            setViewOrder(updated);
            onChanged(); // keep the recent list in sync after edits
          }}
        />
      )}
    </section>
  );
}
