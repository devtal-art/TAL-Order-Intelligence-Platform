import { currencySymbol } from '../../../utils/format.js';
import CustomerInsightsList from '../insights/CustomerInsightsList.jsx';
import CustomerPurchaseHistory from '../CustomerPurchaseHistory.jsx';

const RECENT_ORDERS = 5;
const TOP_PRODUCTS = 5;

// Overview tab: a summary of the other tabs. Business insights, the latest
// few orders, and the top products, with links into the full Orders and
// Products tabs.
export default function ProfileOverviewTab({ profile, onOpenOrder, openBusyRef, goToTab }) {
  const sym = currencySymbol(profile.currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // topProducts arrives sorted by quantity (most purchased first).
  const products = profile.topProducts.slice(0, TOP_PRODUCTS);

  return (
    <div className="ci-profile-grid">
      <CustomerInsightsList customerName={profile.customerName} />

      <div className="ci-profile-split">
        <CustomerPurchaseHistory
          profile={profile}
          onOpenOrder={onOpenOrder}
          openBusyRef={openBusyRef}
          limit={RECENT_ORDERS}
          title="Recent Orders"
          onViewAll={() => goToTab('orders')}
        />

        <section className="ci-card" aria-label="Top products">
          <div className="ci-card-head">
            <h3>Top Products</h3>
            <span className="ci-card-sub">By quantity</span>
          </div>
          {products.length === 0 ? (
            <div className="dl-empty">No product data yet.</div>
          ) : (
            <div className="dl-table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="dl-num">Qty</th>
                    <th className="dl-num">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.productName}>
                      <td>{p.productName}</td>
                      <td className="dl-num">{p.totalQty}</td>
                      <td className="dl-num">{money(p.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {profile.topProducts.length > products.length && (
            <button type="button" className="ci-profile-viewall" onClick={() => goToTab('products')}>
              View product analytics →
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
