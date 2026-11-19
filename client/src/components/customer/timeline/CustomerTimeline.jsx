import { currencySymbol } from '../../../utils/format.js';
import { statusMeta } from '../../../utils/order.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Visual chronological order timeline (Phase 2, feature 2). Orders are
// grouped under a year marker, newest first — mirrors purchaseHistory's
// existing sort order (customerService.getCustomerProfile sorts orders
// upload_timestamp desc), so no re-sort is needed here.
export default function CustomerTimeline({ purchaseHistory, currency, onOpenOrder, openBusyRef }) {
  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const groups = [];
  let currentYear = null;
  for (const o of purchaseHistory) {
    const year = new Date(o.uploadTimestamp).getFullYear();
    const yearLabel = Number.isNaN(year) ? 'Unknown' : String(year);
    if (yearLabel !== currentYear) {
      groups.push({ year: yearLabel, orders: [] });
      currentYear = yearLabel;
    }
    groups[groups.length - 1].orders.push(o);
  }

  if (!purchaseHistory.length) {
    return <div className="dl-empty">No orders to show on the timeline yet.</div>;
  }

  return (
    <div className="ci-timeline" aria-label="Customer order timeline">
      {groups.map((g) => (
        <div className="ci-timeline-year-group" key={g.year}>
          <div className="ci-timeline-year">{g.year}</div>
          <ol className="ci-timeline-list">
            {g.orders.map((o) => {
              const meta = statusMeta(o.resolutionStatus);
              return (
                <li className="ci-timeline-item" key={o.portalOrderRef}>
                  <span className={`ci-timeline-dot ci-timeline-dot--${meta.tone}`} aria-hidden="true" />
                  <div className="ci-timeline-content">
                    <div className="ci-timeline-row-top">
                      <span className="ci-timeline-ref">Order #{o.portalOrderRef}</span>
                      <span className="ci-timeline-date">{o.orderDate || formatDate(o.uploadTimestamp)}</span>
                    </div>
                    <div className="ci-timeline-row-mid">
                      <span className={`og-status og-status-${meta.tone}`}>{meta.label}</span>
                      <span className="ci-timeline-amount">{money(o.total)}</span>
                      <span className="ci-timeline-products">{o.totalProducts} product{o.totalProducts === 1 ? '' : 's'}</span>
                    </div>
                    <button
                      type="button"
                      className="dw-view"
                      onClick={() => onOpenOrder(o.portalOrderRef)}
                      disabled={openBusyRef === o.portalOrderRef}
                    >
                      {openBusyRef === o.portalOrderRef ? '…' : 'View Order'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
