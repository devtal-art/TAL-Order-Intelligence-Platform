import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import SortTh from '../components/SortableHeader.jsx';
import LitInvoiceDot from '../components/LitInvoiceDot.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { orderService } from '../services/orderService.js';
import { deliveryMeta, commentMeta, orderStatusMeta, discountBucketMeta } from '../utils/order.js';
import { formatDisplayDate } from '../utils/dateFormat.js';

const PAGE_SIZE = 25;

// Numbered pagination (new): ‹ … 2 3 4 [5] 6 7 8 … ›
// Shows a window of up to 7 page numbers centred on the current page. Each
// "…" means more pages exist on that side; clicking it jumps a whole window
// (7 pages) in that direction. ‹ / › step one page.
const PAGE_WINDOW = 7;

function NumberedPagination({ page, pages, disabled, onGo }) {
  const half = Math.floor(PAGE_WINDOW / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(pages, start + PAGE_WINDOW - 1);
  start = Math.max(1, end - PAGE_WINDOW + 1);
  const nums = [];
  for (let p = start; p <= end; p += 1) nums.push(p);

  const go = (p) => {
    if (!disabled && p !== page && p >= 1 && p <= pages) onGo(p);
  };

  return (
    <nav className="dl-pg" aria-label="Pagination">
      <button
        type="button"
        className="dl-pg-item dl-pg-arrow"
        onClick={() => go(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
        title="Previous page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
      </button>

      {start > 1 && (
        <button
          type="button"
          className="dl-pg-item dl-pg-ellipsis"
          onClick={() => go(Math.max(1, page - PAGE_WINDOW))}
          disabled={disabled}
          aria-label={`Jump back to page ${Math.max(1, page - PAGE_WINDOW)}`}
          title={`Jump back to page ${Math.max(1, page - PAGE_WINDOW)}`}
        >
          …
        </button>
      )}

      {nums.map((p) => (
        <button
          key={p}
          type="button"
          className={`dl-pg-item dl-pg-num${p === page ? ' is-current' : ''}`}
          onClick={() => go(p)}
          disabled={disabled && p !== page}
          aria-current={p === page ? 'page' : undefined}
          aria-label={`Page ${p}`}
        >
          {p}
        </button>
      ))}

      {end < pages && (
        <button
          type="button"
          className="dl-pg-item dl-pg-ellipsis"
          onClick={() => go(Math.min(pages, page + PAGE_WINDOW))}
          disabled={disabled}
          aria-label={`Jump forward to page ${Math.min(pages, page + PAGE_WINDOW)}`}
          title={`Jump forward to page ${Math.min(pages, page + PAGE_WINDOW)}`}
        >
          …
        </button>
      )}

      <button
        type="button"
        className="dl-pg-item dl-pg-arrow"
        onClick={() => go(page + 1)}
        disabled={disabled || page >= pages}
        aria-label="Next page"
        title="Next page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </nav>
  );
}

// "Go to page" box for the pager (new, additive). Typing a number and pressing
// Enter (or Go) jumps straight there; out-of-range numbers are clamped to
// 1…pages, and the box resets to the current page whenever the page changes.
function PageJump({ page, pages, disabled, onGo }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  const target = Math.min(pages, Math.max(1, Math.floor(Number(draft)) || page));
  const submit = (e) => {
    e.preventDefault();
    setDraft(String(target));
    if (target !== page) onGo(target);
  };

  return (
    <form className="dl-page-jump" onSubmit={submit}>
      <label htmlFor="dl-page-jump-input">Go to page</label>
      <input
        id="dl-page-jump-input"
        type="number"
        min="1"
        max={pages}
        step="1"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        aria-label={`Page number, 1 to ${pages}`}
      />
      <button type="submit" className="dl-page-btn" disabled={disabled || target === page}>Go</button>
    </form>
  );
}

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
  // Order Date range (optional, 'YYYY-MM-DD') — only offered on the All Orders
  // and channel (Email / Manual) lists; ignored for every other list type.
  const hasDateFilter = type === 'allOrders' || type === 'channel';
  const from = hasDateFilter ? params.get('from') || '' : '';
  const to = hasDateFilter ? params.get('to') || '' : '';
  const dateParams = () => {
    const d = {};
    if (from) d.from = from;
    if (to) d.to = to;
    return d;
  };

  // Clicking a header sorts by it (ascending first); clicking the same
  // header again flips direction. Changing the sort resets to page 1 so the
  // reader isn't left on a page number that no longer makes sense once the
  // order changes.
  const toggleSort = (column) => {
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    setParams({ type, value, page: '1', sortBy: column, sortDir: nextDir, ...dateParams() });
  };

  // Changing the date range resets to page 1 (the result set changed) and
  // keeps the current sort.
  const setDateFilter = (key, v) => {
    const next = { type, value, page: '1', ...dateParams() };
    if (sortBy) {
      next.sortBy = sortBy;
      next.sortDir = sortDir;
    }
    if (v) next[key] = v;
    else delete next[key];
    setParams(next);
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
            : type === 'litInvoice' && value === 'has'
            ? { label: 'Lit Invoice', tone: 'litinvoice', title: 'Orders marked as Lit Invoice' }
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
      .dashboardOrders({ type, value, page, limit: PAGE_SIZE, sortBy: sortBy || undefined, sortDir, from: from || undefined, to: to || undefined })
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
  }, [type, value, page, sortBy, sortDir, from, to, refreshToken]);

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
    const next = { type, value, page: String(p), ...dateParams() };
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

        {hasDateFilter && (
          <div className="al-filters">
            <div className="al-filter-field">
              <label htmlFor="dl-from" className="al-filter-label">Order Date from</label>
              <input
                id="dl-from"
                type="date"
                className="sol-input"
                value={from}
                onChange={(e) => setDateFilter('from', e.target.value)}
              />
            </div>
            <div className="al-filter-field">
              <label htmlFor="dl-to" className="al-filter-label">Order Date to</label>
              <input
                id="dl-to"
                type="date"
                className="sol-input"
                value={to}
                onChange={(e) => setDateFilter('to', e.target.value)}
              />
            </div>
            {(from || to) && (
              <div className="al-filter-field">
                <label className="al-filter-label">&nbsp;</label>
                <button
                  className="sol-edit-btn"
                  type="button"
                  onClick={() => setParams({ type, value, page: '1', ...(sortBy ? { sortBy, sortDir } : {}) })}
                >
                  Clear dates
                </button>
              </div>
            )}
          </div>
        )}

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
                  {/* Lit Invoice dot column — sortable (green first, then red on
                      the second click). Same sort wiring as SortTh; written out
                      here only because this narrow column also needs dl-lit. */}
                  <th className={`dl-lit dl-sort-th dl-lit-sort${sortBy === 'litInvoice' ? ' dl-sort-active' : ''}`}>
                    <button
                      type="button"
                      className="dl-sort-btn"
                      onClick={() => toggleSort('litInvoice')}
                      aria-sort={sortBy === 'litInvoice' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={
                        sortBy === 'litInvoice'
                          ? `Sorted by Lit Invoice: ${sortDir === 'asc' ? 'green first' : 'red first'}. Click to reverse.`
                          : 'Sort by Lit Invoice (green / red)'
                      }
                      title={
                        sortBy === 'litInvoice'
                          ? (sortDir === 'asc' ? 'Green first — click for red first' : 'Red first — click for green first')
                          : 'Sort by Lit Invoice (green / red)'
                      }
                    >
                      <span className="dl-lit-sort-icon" aria-hidden="true" />
                      <span className="dl-sort-arrow" aria-hidden="true">
                        {sortBy === 'litInvoice' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
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
                    <td className="dl-lit"><LitInvoiceDot on={o.litInvoice} /></td>
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
            <NumberedPagination page={page} pages={pages} disabled={loading} onGo={gotoPage} />
            <PageJump page={page} pages={pages} disabled={loading} onGo={gotoPage} />
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
