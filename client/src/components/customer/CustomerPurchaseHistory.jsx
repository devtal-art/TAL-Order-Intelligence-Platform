import { currencySymbol } from '../../utils/format.js';
import { statusMeta } from '../../utils/order.js';

// Order-by-order table for one customer (newest Order Date first — the
// server's purchaseHistory order). Used twice on the profile:
//   • Orders tab — every order (`limit` omitted).
//   • Overview tab — the latest few (`limit`), with a "View all" action.
// Yearly revenue moved to the Finance tab (ProfileFinanceTab).
export default function CustomerPurchaseHistory({ profile, onOpenOrder, openBusyRef, limit, title = 'Purchase History', onViewAll }) {
  const sym = currencySymbol(profile.currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const all = profile.purchaseHistory;
  const rows = limit ? all.slice(0, limit) : all;
  const compact = Boolean(limit);

  return (
    <section className="ci-card" aria-label={title}>
      <div className="ci-card-head">
        <h3>{title}</h3>
        <span className="ci-card-sub">
          {compact ? `Latest ${rows.length} of ${all.length}` : `${all.length} order${all.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="dl-empty">No orders yet.</div>
      ) : (
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Order Date</th>
                {!compact && <th>Processed By</th>}
                <th>Status</th>
                {!compact && <th>Order Status</th>}
                {!compact && <th className="dl-num">Products</th>}
                <th className="dl-num">Total</th>
                {!compact && <th className="dl-num">Lit Invoice</th>}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const meta = statusMeta(o.resolutionStatus);
                return (
                  <tr key={o.portalOrderRef}>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.orderDate || <span className="dl-muted">—</span>}</td>
                    {!compact && <td>{o.processedBy || <span className="dl-muted">Not Assigned</span>}</td>}
                    <td><span className={`og-status og-status-${meta.tone}`}>{meta.label}</span></td>
                    {!compact && <td>{o.orderStatus || <span className="dl-muted">—</span>}</td>}
                    {!compact && <td className="dl-num">{o.totalProducts}</td>}
                    <td className="dl-num">{money(o.total)}</td>
                    {!compact && (
                      <td className="dl-num">
                        {o.invoicedValue === null || o.invoicedValue === undefined
                          ? <span className="dl-muted">—</span>
                          : money(o.invoicedValue)}
                      </td>
                    )}
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
      )}
      {compact && onViewAll && all.length > rows.length && (
        <button type="button" className="ci-profile-viewall" onClick={onViewAll}>
          View all {all.length} orders →
        </button>
      )}
    </section>
  );
}
