import { currencySymbol } from '../../utils/format.js';
import { statusMeta } from '../../utils/order.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Purchase history and yearly revenue for one customer. Monthly revenue
// moved to CustomerFinancialSummary's trend chart, and product analytics
// moved to the dedicated (Phase 2) ProductAnalytics component — this file
// now covers only the order-by-order table and the yearly rollup.
export default function CustomerPurchaseHistory({ profile, onOpenOrder, openBusyRef }) {
  const sym = currencySymbol(profile.currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="ci-profile-grid">
      <section className="ci-card" aria-label="Purchase history">
        <div className="ci-card-head">
          <h3>Purchase History</h3>
          <span className="ci-card-sub">{profile.purchaseHistory.length} order{profile.purchaseHistory.length === 1 ? '' : 's'}</span>
        </div>
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Order Date</th>
                <th>Processed By</th>
                <th>Status</th>
                <th className="dl-num">Products</th>
                <th className="dl-num">Total</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {profile.purchaseHistory.map((o) => {
                const meta = statusMeta(o.resolutionStatus);
                return (
                  <tr key={o.portalOrderRef}>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.orderDate || formatDate(o.uploadTimestamp)}</td>
                    <td>{o.processedBy || <span className="dl-muted">Not Assigned</span>}</td>
                    <td><span className={`og-status og-status-${meta.tone}`}>{meta.label}</span></td>
                    <td className="dl-num">{o.totalProducts}</td>
                    <td className="dl-num">{money(o.total)}</td>
                    <td className="dl-act">
                      <button
                        className="dw-view"
                        type="button"
                        onClick={() => onOpenOrder(o.portalOrderRef)}
                        disabled={openBusyRef === o.portalOrderRef}
                      >
                        {openBusyRef === o.portalOrderRef ? '…' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ci-card" aria-label="Yearly revenue">
        <div className="ci-card-head">
          <h3>Yearly Revenue</h3>
        </div>
        {profile.yearlyRevenue.length === 0 ? (
          <div className="dl-empty">No revenue data yet.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="dl-num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {profile.yearlyRevenue.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="dl-num">{money(y.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
