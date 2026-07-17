import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderService } from '../services/orderService.js';
import { deliveryMeta, commentMeta, PROCESSED_BY_USERS } from '../utils/order.js';

// Dashboard widgets (V2.2, read-only). Two widget groups:
//   1. Order Status — Delivered / Half Delivered / Not Delivered
//   2. Comments     — Released / OS / N/A / Not Found
// Each card previews the latest orders containing AT LEAST ONE product in
// that bucket (order summaries only — never the product rows) plus a
// "View All" link to the full filtered table (/dashboard/orders).
//
// Data is fetched from GET /v1/orders/dashboard — a single round trip,
// derived live from the Orders collection. `refreshToken` re-fetches when it
// changes: the host page bumps it after any order edit is saved, so the
// widgets always reflect the latest data without a manual refresh.
export default function DashboardWidgets({ refreshToken = 0, onView, viewBusyRef = '' }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Accordion: exactly one bucket open per section at a time. Defaults to
  // the first bucket (Delivered / Released) once data arrives; user's choice
  // is preserved across refreshes (only seeded when unset).
  const [openStatus, setOpenStatus] = useState(null);
  const [openComment, setOpenComment] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .dashboard(5) // preview cap: latest 5 orders per bucket
      .then((s) => {
        if (!cancelled) {
          setSummary(s);
          setOpenStatus((cur) => cur ?? s.statuses[0]?.value ?? null);
          setOpenComment((cur) => cur ?? s.comments[0]?.value ?? null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load the dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (loading && !summary) return <div className="dw-loading">Loading dashboard…</div>;
  if (error) return <div className="sol-error">{error}</div>;
  if (!summary) return null;

  return (
    <>
      <div className="dw-stats">
        <div className="dw-stat-card dw-stat-card--orders">
          <div className="dw-stat-top">
            <span className="dw-stat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="4" y="8" width="16" height="12" rx="2" />
                <path d="M8 8V6a4 4 0 0 1 8 0v2" />
              </svg>
            </span>
            <span className="dw-stat-label">Total Orders</span>
          </div>
          <div className="dw-stat-body">
            <div className="dw-stat-value">{summary.totalOrders}</div>
            <div className="dw-stat-caption">All-time total</div>
          </div>
        </div>

        <div className="dw-stat-card dw-stat-card--today">
          <div className="dw-stat-top">
            <span className="dw-stat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M4 10h16M8 3v4M16 3v4" />
              </svg>
            </span>
            <span className="dw-stat-label">Today&rsquo;s Orders</span>
          </div>
          <div className="dw-stat-body">
            <div className="dw-stat-value">{summary.todayOrders}</div>
            <div className="dw-stat-caption">Resets at midnight</div>
          </div>
        </div>

        <div className="dw-stat-card dw-stat-card--released dw-stat-card--list">
          <div className="dw-stat-top">
            <span className="dw-stat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
              </svg>
            </span>
            <span className="dw-stat-label">Released Orders by Processor</span>
          </div>
          <div className="dw-stat-body">
            <ul className="dw-stat-list">
              {PROCESSED_BY_USERS.map((user) => (
                <li key={user}>
                  <span>{user}</span>
                  <span className="dw-stat-pill">{summary.releasedByProcessor?.[user] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className={`dw-wrap${loading ? ' is-refreshing' : ''}`}>
        <section className="dw-section" aria-label="Orders by delivery status">
          <div className="dw-section-head">
            <div className="dw-section-title">Order Status</div>
            <div className="dw-section-sub">Orders grouped by their products’ delivery status</div>
          </div>
          <div className="dw-cards">
            {summary.statuses.map((bucket) => (
              <BucketCard
                key={bucket.value}
                type="status"
                bucket={bucket}
                meta={deliveryMeta(bucket.value)}
                onView={onView}
                viewBusyRef={viewBusyRef}
                isOpen={openStatus === bucket.value}
                onToggle={() =>
                  setOpenStatus((cur) => (cur === bucket.value ? null : bucket.value))
                }
              />
            ))}
          </div>
        </section>

        <section className="dw-section" aria-label="Orders by product comment">
          <div className="dw-section-head">
            <div className="dw-section-title">Comments</div>
            <div className="dw-section-sub">Orders grouped by their products’ comment</div>
          </div>
          <div className="dw-cards">
            {summary.comments.map((bucket) => (
              <BucketCard
                key={bucket.value}
                type="comment"
                bucket={bucket}
                meta={commentMeta(bucket.value)}
                onView={onView}
                viewBusyRef={viewBusyRef}
                isOpen={openComment === bucket.value}
                onToggle={() =>
                  setOpenComment((cur) => (cur === bucket.value ? null : bucket.value))
                }
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// One dashboard bucket card: tone-coloured header bar that toggles open/shut
// (accordion — one bucket expanded per section), revealing up to
// `previewLimit` order summary rows plus the View All footer link.
function BucketCard({ type, bucket, meta, onView, viewBusyRef, isOpen, onToggle }) {
  // meta is always known for platform values; guard anyway so an unexpected
  // bucket never crashes the whole dashboard.
  const label = meta?.label || bucket.value;
  const tone = meta?.tone || 'na';
  const q = `?type=${encodeURIComponent(type)}&value=${encodeURIComponent(bucket.value)}`;

  return (
    <div className={`dw-card dw-${tone}${isOpen ? ' is-open' : ' is-collapsed'}`}>
      <button
        type="button"
        className="dw-card-head"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="dw-dot" aria-hidden="true" />
        <span className="dw-card-title">{label}</span>
        <span className="dw-count" title={`${bucket.total} order${bucket.total === 1 ? '' : 's'}`}>
          {bucket.total}
        </span>
        <svg className="dw-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <>
          {bucket.orders.length === 0 ? (
            <div className="dw-empty">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              No orders in this section yet
            </div>
          ) : (
            <ul className="dw-list">
              {bucket.orders.map((o) => (
                <li key={o.id} className="dw-row">
                  <div className="dw-row-main">
                    <div className="dw-row-top">
                      <span className="dw-ref">#{o.portalOrderRef}</span>
                      <span className="dw-cust" title={o.customerName || 'No customer'}>
                        {o.customerName || 'No customer'}
                      </span>
                      <span className="dw-date">{o.orderDate || '—'}</span>
                    </div>
                    <div className="dw-by">
                      {o.processedBy ? (
                        <>Processed by <b>{o.processedBy}</b></>
                      ) : (
                        <span className="dw-by-empty">Not assigned</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="dw-view"
                    type="button"
                    onClick={() => onView(o.portalOrderRef)}
                    disabled={viewBusyRef === o.portalOrderRef}
                  >
                    {viewBusyRef === o.portalOrderRef ? '…' : 'View'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link className="dw-viewall" to={`/dashboard/orders${q}`}>
            View All
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </>
      )}
    </div>
  );
}
