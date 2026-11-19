import { useMemo, useState } from 'react';
import { currencySymbol } from '../../../utils/format.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// One product list, four sort orderings — covers "Most Purchased",
// "Highest Revenue Products", "Recently Purchased Products", and "Most
// Frequently Ordered Products" (Phase 2, feature 4) as tabs over a single
// dataset instead of four near-duplicate components/queries.
const TABS = [
  { key: 'qty', label: 'Most Purchased', sort: (a, b) => b.totalQty - a.totalQty },
  { key: 'revenue', label: 'Highest Revenue', sort: (a, b) => b.totalSpent - a.totalSpent },
  { key: 'recent', label: 'Recently Purchased', sort: (a, b) => new Date(b.lastPurchaseDate) - new Date(a.lastPurchaseDate) },
  { key: 'frequency', label: 'Most Frequent', sort: (a, b) => b.frequencyPct - a.frequencyPct },
];

export default function ProductAnalytics({ topProducts, currency }) {
  const [tab, setTab] = useState('qty');
  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sorted = useMemo(() => {
    const sorter = TABS.find((t) => t.key === tab)?.sort || TABS[0].sort;
    return [...topProducts].sort(sorter);
  }, [topProducts, tab]);

  return (
    <section className="ci-card" aria-label="Product analytics">
      <div className="ci-card-head">
        <h3>Product Analytics</h3>
      </div>

      <div className="ci-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`ci-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="dl-empty">No product data yet.</div>
      ) : (
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="dl-num">Qty</th>
                <th className="dl-num">Orders</th>
                <th className="dl-num">Frequency</th>
                <th>Last Purchased</th>
                <th className="dl-num">Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.productName}>
                  <td>{p.productName}</td>
                  <td className="dl-num">{p.totalQty}</td>
                  <td className="dl-num">{p.orderCount}</td>
                  <td className="dl-num">{p.frequencyPct}%</td>
                  <td>{formatDate(p.lastPurchaseDate)}</td>
                  <td className="dl-num">{money(p.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
