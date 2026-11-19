import { currencySymbol } from '../../utils/format.js';
import StatCard from './analytics/StatCard.jsx';
import LineChart from './charts/LineChart.jsx';

function monthLabel(key) {
  const [y, m] = String(key).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// Core financial summary for a customer profile. Phase 1 shipped the stat
// tiles; Phase 2 adds the monthly revenue trend chart, highest/lowest order,
// largest purchase month, total products/quantity purchased, and
// month-over-month revenue growth (feature 3: Financial Dashboard).
export default function CustomerFinancialSummary({ financials, monthlyRevenue = [], currency }) {
  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tiles = [
    { key: 'revenue', label: 'Lifetime Revenue', value: money(financials.totalRevenue) },
    { key: 'orders', label: 'Total Orders', value: String(financials.orderCount) },
    { key: 'avg', label: 'Avg Order Value', value: money(financials.avgOrderValue) },
    { key: 'products', label: 'Products Purchased', value: String(financials.totalProductsPurchased ?? 0) },
    { key: 'qty', label: 'Total Quantity', value: String(financials.totalQuantityPurchased ?? 0) },
    { key: 'highest', label: 'Highest Order', value: financials.highestOrder ? money(financials.highestOrder.total) : '—', caption: financials.highestOrder ? `Order #${financials.highestOrder.portalOrderRef}` : null },
    { key: 'lowest', label: 'Lowest Order', value: financials.lowestOrder ? money(financials.lowestOrder.total) : '—', caption: financials.lowestOrder ? `Order #${financials.lowestOrder.portalOrderRef}` : null },
    { key: 'largest-month', label: 'Largest Purchase Month', value: financials.largestPurchaseMonth ? monthLabel(financials.largestPurchaseMonth.month) : '—', caption: financials.largestPurchaseMonth ? money(financials.largestPurchaseMonth.revenue) : null },
    {
      key: 'growth',
      label: 'Revenue Growth (MoM)',
      value: financials.revenueGrowthPct === null || financials.revenueGrowthPct === undefined
        ? 'Not enough data'
        : `${financials.revenueGrowthPct >= 0 ? '+' : ''}${financials.revenueGrowthPct}%`,
    },
  ];

  return (
    <>
      <div className="ci-stat-row" aria-label="Customer financial summary">
        {tiles.map((t) => (
          <StatCard key={t.key} label={t.label} value={t.value} caption={t.caption} />
        ))}
      </div>

      <section className="ci-card" aria-label="Monthly revenue trend">
        <div className="ci-card-head">
          <h3>Monthly Revenue Trend</h3>
        </div>
        {monthlyRevenue.length === 0 ? (
          <div className="dl-empty">No revenue data yet.</div>
        ) : (
          <LineChart
            ariaLabel="Monthly revenue trend"
            data={monthlyRevenue.map((m) => ({ label: monthLabel(m.month), value: m.revenue }))}
            formatValue={money}
          />
        )}
      </section>
    </>
  );
}
