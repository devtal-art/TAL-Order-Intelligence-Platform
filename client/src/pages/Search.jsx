import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import SavedOrderLookup, { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
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
                <th>Order #</th>
                <th>Customer</th>
                <th>Processed By</th>
                <th>Order Date</th>
                <th>Status</th>
                <th className="dl-num">Products</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const meta = statusMeta(o.resolutionStatus);
                return (
                  <tr key={o.id}>
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
