import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import { analyticsService } from '../../services/customer/analyticsService.js';
import { currencySymbol } from '../../utils/format.js';

const METRICS = [
  { key: 'revenue', label: 'Highest Spending', valueKey: 'totalRevenue', kind: 'money' },
  { key: 'orders', label: 'Most Active (Order Count)', valueKey: 'orderCount', kind: 'number' },
  { key: 'orderValue', label: 'Highest Order Value', valueKey: 'highestOrderValue', kind: 'money' },
  { key: 'quantity', label: 'Largest Quantity Purchased', valueKey: 'totalQuantity', kind: 'number' },
  { key: 'frequency', label: 'Most Frequent (Shortest Cycle)', valueKey: 'avgDaysBetweenOrders', kind: 'days' },
];

// Customer Rankings / leaderboards (Phase 2, feature 9). One page, five
// metric tabs over the same GET /customer-analytics/rankings?metric=
// endpoint — avoids five near-identical pages/queries.
export default function CustomerRankings() {
  const [metric, setMetric] = useState('revenue');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError('');
    analyticsService
      .rankings({ metric, limit: 20 })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load rankings.');
      });
    return () => {
      cancelled = true;
    };
  }, [metric]);

  const activeMetric = METRICS.find((m) => m.key === metric);

  const formatValue = (row) => {
    const sym = currencySymbol(row.currency || 'GBP');
    const v = row[activeMetric.valueKey];
    if (activeMetric.kind === 'money') return `${sym}${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (activeMetric.kind === 'days') return v === null || v === undefined ? 'Single order' : `every ~${v} days`;
    return String(v ?? 0);
  };

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-rankings">
        <div className="dbp-top">
          <h2>Customer Rankings</h2>
          <p>Leaderboards across the platform's customer base.</p>
        </div>

        <div className="ci-tabs" role="tablist">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              className={`ci-tab${metric === m.key ? ' active' : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {error && <div className="sol-error">{error}</div>}

        {rows === null && !error ? (
          <div className="dw-loading">Loading rankings…</div>
        ) : rows && rows.length === 0 ? (
          <div className="dl-empty">Not enough data yet for this ranking.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th className="dl-num">Orders</th>
                  <th className="dl-num">{activeMetric.label}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {(rows || []).map((r, i) => (
                  <tr key={r.customerName}>
                    <td className="dl-num">{i + 1}</td>
                    <td>{r.customerName}</td>
                    <td className="dl-num">{r.orderCount}</td>
                    <td className="dl-num">{formatValue(r)}</td>
                    <td className="dl-act">
                      <Link className="dw-view" to={`/customers/${encodeURIComponent(r.customerName)}`}>View Profile</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
