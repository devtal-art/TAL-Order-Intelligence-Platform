import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import { orderService } from '../services/orderService.js';
import { deliveryMeta, commentMeta } from '../utils/order.js';

const PAGE_SIZE = 25;

// "View All" page (V2.2): the complete, paginated list of orders in ONE
// dashboard bucket — /dashboard/orders?type=status|comment&value=<bucket>.
// Same data source as the widgets (GET /v1/orders/dashboard/orders), derived
// live from the Orders collection. View opens the order detail modal directly.
export default function DashboardList() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || '';
  const value = params.get('value') || '';
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);

  const meta = type === 'status' ? deliveryMeta(value) : type === 'comment' ? commentMeta(value) : null;
  const badgeClass = type === 'status' ? `ds-badge ds-${meta?.tone}` : `cm-badge cm-${meta?.tone}`;

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  // Direct View modal — identical wiring to the Dashboard page.
  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');

  useEffect(() => {
    if (!meta) return; // invalid/missing params — handled in render
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .dashboardOrders({ type, value, page, limit: PAGE_SIZE })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load the orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meta derives from type/value
  }, [type, value, page, refreshToken]);

  const openOrder = useCallback(
    async (ref) => {
      setViewBusyRef(ref);
      setError('');
      try {
        setViewOrder(await orderService.get(ref));
      } catch (e) {
        setError(e.message || `Could not open order ${ref}.`);
      } finally {
        setViewBusyRef('');
      }
    },
    []
  );

  const gotoPage = (p) => setParams({ type, value, page: String(p) });

  if (!meta) {
    return (
      <Layout>
        <div className="screen active" id="s-dashboard-list">
          <div className="dl-head">
            <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          </div>
          <div className="dl-empty">Unknown dashboard section. Pick a widget on the Dashboard.</div>
        </div>
      </Layout>
    );
  }

  const rows = result?.data || [];
  const total = result?.meta?.total ?? 0;
  const pages = result?.meta?.pages ?? 1;

  return (
    <Layout>
      <div className="screen active" id="s-dashboard-list">
        <div className="dl-head">
          <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          <h2 className="dl-title">
            <span className={badgeClass}>{meta.label}</span>
            {type === 'status' ? 'Orders by delivery status' : 'Orders by comment'}
          </h2>
          {!loading && (
            <span className="dl-total">
              {total} order{total === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading && !result ? (
          <div className="dw-loading">Loading orders…</div>
        ) : rows.length === 0 ? (
          <div className="dl-empty">No orders with a “{meta.label}” product yet.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Processed By</th>
                  <th>Order Date</th>
                  <th className="dl-num">Products</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.customerName || '—'}</td>
                    <td>{o.processedBy || <span className="dl-muted">Not Assigned</span>}</td>
                    <td>{o.orderDate || '—'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="dl-pager">
            <button className="dl-page-btn" type="button" disabled={page <= 1 || loading} onClick={() => gotoPage(page - 1)}>
              ← Previous
            </button>
            <span className="dl-page-info">
              Page {page} of {pages}
            </span>
            <button className="dl-page-btn" type="button" disabled={page >= pages || loading} onClick={() => gotoPage(page + 1)}>
              Next →
            </button>
          </div>
        )}

        {viewOrder && (
          <SavedOrderDetailModal
            order={viewOrder}
            onClose={() => setViewOrder(null)}
            onDownload={() => downloadOrderExcel(viewOrder)}
            onSaved={(updated) => {
              setViewOrder(updated);
              setRefreshToken((t) => t + 1); // edits may drop the order out of this bucket
            }}
          />
        )}
      </div>
    </Layout>
  );
}
