import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import SortTh from '../components/SortableHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { orderService } from '../services/orderService.js';
import { deliveryMeta, commentMeta, orderStatusMeta, discountBucketMeta } from '../utils/order.js';
import { formatDisplayDate } from '../utils/dateFormat.js';

const PAGE_SIZE = 25;

// "View All" page (V2.2): the complete, paginated list of orders in ONE
// dashboard bucket — /dashboard/orders?type=status|comment&value=<bucket>.
// Same data source as the widgets (GET /v1/orders/dashboard/orders), derived
// live from the Orders collection. View opens the order detail modal directly.
export default function DashboardList() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || '';
  const value = params.get('value') || '';
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const sortBy = params.get('sortBy') || '';
  const sortDir = params.get('sortDir') === 'desc' ? 'desc' : 'asc';

  // Clicking a header sorts by it (ascending first); clicking the same
  // header again flips direction. Changing the sort resets to page 1 so the
  // reader isn't left on a page number that no longer makes sense once the
  // order changes.
  const toggleSort = (column) => {
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    setParams({ type, value, page: '1', sortBy: column, sortDir: nextDir });
  };

  // Discount (V4.7): title needs the bucket's own label baked in (unlike
  // the generic fallback subtitles below), so it's built up front here.
  const discMeta = type === 'discount' ? discountBucketMeta(value) : null;

  const meta =
    type === 'status'
      ? deliveryMeta(value)
      : type === 'comment'
        ? commentMeta(value)
        : type === 'orderStatus'
          ? orderStatusMeta(value)
          : type === 'discount'
            ? (discMeta ? { ...discMeta, title: `Orders with ${discMeta.label}` } : null)
            : type === 'channel'
              ? { label: value === 'Order - Kumkum' ? 'Manual Orders' : value, tone: value === 'Orders - Email' ? 'problem' : 'cancelled', title: `${value === 'Order - Kumkum' ? 'Manual Orders' : value} orders` }
              : type === 'orderComment' && value === 'has'
            ? { label: 'Order Comments', tone: 'comments', title: 'Orders with an Order Comment' }
            : type === 'orderIssue' && value === 'has'
            ? { label: 'Half Released', tone: 'issues', title: 'Half Released — orders with at least one OS or Not Found item' }
            : type === 'deliveryDate'
              ? { label: `Delivery: ${formatDisplayDate(value)}`, tone: 'released', title: `Orders for delivery date ${formatDisplayDate(value)}` }
              : type === 'today'
                ? { label: "Today's Orders", tone: 'released', title: 'Orders processed today' }
                : type === 'todayProcessor'
                  ? { label: `Today: ${value}`, tone: 'released', title: `Orders processed today by ${value}` }
                  : type === 'allOrders'
                    ? { label: 'All Orders', tone: 'released', title: 'All orders' }
                    : type === 'processor'
                      ? { label: `Processor: ${value}`, tone: 'released', title: `Orders processed by ${value}` }
                      : type === 'processorOriginal'
                        ? { label: `Originally: ${value}`, tone: 'cancelled', title: `Orders originally processed by ${value}, now reassigned to Chat Team` }
                        : null;
  const badgeClass =
    type === 'status' ? `ds-badge ds-${meta?.tone}` : type === 'comment' ? `cm-badge cm-${meta?.tone}` : `os-badge os-${meta?.tone || 'released'}`;

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
      .dashboardOrders({ type, value, page, limit: PAGE_SIZE, sortBy: sortBy || undefined, sortDir })
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
  }, [type, value, page, sortBy, sortDir, refreshToken]);

  // Discount Provided toggle (only rendered when type === 'discount') — its
  // own busy ref so toggling one row doesn't disable the whole table, and an
  // optimistic local update of `result.data` on success so the row flips
  // color immediately without a full refetch.
  const [toggleBusyRef, setToggleBusyRef] = useState('');
  const toggleDiscountProvided = useCallback(async (ref, current) => {
    setToggleBusyRef(ref);
    setError('');
    try {
      const updated = await orderService.setDiscountProvided(ref, !current);
      setResult((r) =>
        r
          ? { ...r, data: r.data.map((o) => (o.portalOrderRef === ref ? { ...o, discountProvided: updated.discountProvided } : o)) }
          : r
      );
    } catch (e) {
      setError(e.message || `Could not update order ${ref}.`);
    } finally {
      setToggleBusyRef('');
    }
  }, []);

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

  const gotoPage = (p) => {
    const next = { type, value, page: String(p) };
    if (sortBy) {
      next.sortBy = sortBy;
      next.sortDir = sortDir;
    }
    setParams(next);
  };

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
            {meta.title ||
              (type === 'status'
                ? 'Orders by item status'
                : type === 'comment'
                  ? 'Orders by reason'
                  : type === 'orderComment'
                    ? 'Orders with an Order Comment'
                    : 'Orders by order status')}
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
          <div className="dl-empty">
            {type === 'orderComment'
              ? 'No orders with an Order Comment yet.'
              : type === 'orderStatus'
                ? `No orders with Order Status “${meta.label}” yet.`
                : `No orders found for “${meta.label}”.`}
          </div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <SortTh column="ref" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order #</SortTh>
                  <SortTh column="customer" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Customer</SortTh>
                  {type === 'orderComment' ? <th>Order Comment</th> : null}
                  <SortTh column="processedBy" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Processed By</SortTh>
                  <SortTh column="orderStatus" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order Status</SortTh>
                  <SortTh column="orderDate" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order Date</SortTh>
                  {type === 'orderComment' ? null : (
                    <SortTh column="products" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} numeric>Products</SortTh>
                  )}
                  {type === 'discount' && !isViewer ? <th>Discount</th> : null}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.customerName || '—'}</td>
                    {type === 'orderComment' ? (
                      <td className="dl-comment" title={o.orderComment}>
                        {o.orderComment || '—'}
                      </td>
                    ) : null}
                    <td>{o.processedBy || <span className="dl-muted">Not Assigned</span>}</td>
                    <td>
                      {(() => {
                        const sm = orderStatusMeta(o.orderStatus);
                        return sm ? <span className={`os-badge os-${sm.tone}`}>{sm.label}</span> : <span className="dl-muted">—</span>;
                      })()}
                    </td>
                    <td>{o.orderDate || '—'}</td>
                    {type === 'orderComment' ? null : <td className="dl-num">{o.totalProducts}</td>}
                    {type === 'discount' && !isViewer ? (
                      <td>
                        <div className="dl-discount-cell">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={o.discountProvided}
                            className={`dl-discount-switch${o.discountProvided ? ' is-provided' : ''}`}
                            onClick={() => toggleDiscountProvided(o.portalOrderRef, o.discountProvided)}
                            disabled={toggleBusyRef === o.portalOrderRef}
                            title={o.discountProvided ? 'Discount provided — click to mark as not provided' : 'Discount not provided — click to mark as provided'}
                          >
                            <span className="dl-discount-switch-thumb" />
                          </button>
                          <span className={`dl-discount-label${o.discountProvided ? ' is-provided' : ''}`}>
                            {o.discountProvided ? 'Provided' : 'Not Provided'}
                          </span>
                        </div>
                      </td>
                    ) : null}
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
