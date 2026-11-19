import { useEffect, useState } from 'react';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import StatCard from '../../components/customer/analytics/StatCard.jsx';
import BarChart from '../../components/customer/charts/BarChart.jsx';
import LineChart from '../../components/customer/charts/LineChart.jsx';
import DonutChart from '../../components/customer/charts/DonutChart.jsx';
import { analyticsService } from '../../services/customer/analyticsService.js';

const money = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthLabel(key) {
  const [y, m] = String(key).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// Platform-wide Analytics Dashboard (Phase 2, feature 8) — the Customer
// Intelligence module's overview page. All cards/charts come from one
// GET /customer-analytics/overview call (read-only, live-aggregated).
export default function CustomerAnalyticsDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    analyticsService
      .overview(12)
      .then((r) => {
        if (!cancelled) setOverview(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load analytics.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-analytics">
        <div className="dbp-top">
          <h2>Analytics Dashboard</h2>
          <p>Platform-wide customer and revenue analytics, derived live from saved orders.</p>
        </div>

        {error && <div className="sol-error">{error}</div>}

        {!overview && !error ? (
          <div className="dw-loading">Loading analytics…</div>
        ) : overview ? (
          <>
            <div className="ci-analytics-cards">
              <StatCard label="Total Customers" value={overview.cards.totalCustomers} />
              <StatCard label="Total Revenue" value={money(overview.cards.totalRevenue)} />
              <StatCard label="Repeat Customers" value={overview.cards.repeatCustomers} caption={`${overview.cards.repeatCustomerRatePct}% of all customers`} />
              <StatCard label="Average Revenue / Customer" value={money(overview.cards.averageRevenue)} />
              <StatCard label="Average Order Value" value={money(overview.cards.averageOrderValue)} />
              <StatCard label="Average Products / Order" value={overview.cards.averageProductsPerOrder} />
              <StatCard label="Revenue This Month" value={money(overview.cards.monthlyRevenue)} />
              <StatCard label="Orders This Month" value={overview.cards.ordersThisMonth} />
            </div>

            <div className="ci-charts-grid">
              <section className="ci-card" aria-label="Revenue trend">
                <div className="ci-card-head"><h3>Revenue Trend</h3></div>
                <LineChart
                  ariaLabel="Monthly revenue trend, last 12 months"
                  data={overview.charts.revenueTrend.map((m) => ({ label: monthLabel(m.month), value: m.revenue }))}
                  formatValue={money}
                />
              </section>

              <section className="ci-card" aria-label="Customer growth">
                <div className="ci-card-head"><h3>Customer Growth</h3></div>
                <LineChart
                  ariaLabel="New customers per month, last 12 months"
                  data={overview.charts.customerGrowth.map((m) => ({ label: monthLabel(m.month), value: m.newCustomers }))}
                  color="var(--success)"
                />
              </section>

              <section className="ci-card" aria-label="Monthly orders">
                <div className="ci-card-head"><h3>Monthly Orders</h3></div>
                <LineChart
                  ariaLabel="Order count per month, last 12 months"
                  data={overview.charts.monthlyOrders.map((m) => ({ label: monthLabel(m.month), value: m.orders }))}
                  color="var(--warn-icon)"
                />
              </section>

              <section className="ci-card" aria-label="Repeat vs new customers">
                <div className="ci-card-head"><h3>Repeat vs. New Customers</h3></div>
                <DonutChart
                  ariaLabel="Repeat vs new customers"
                  data={[
                    { label: 'Repeat', value: overview.cards.repeatCustomers, color: 'var(--success)' },
                    { label: 'One-time', value: overview.cards.totalCustomers - overview.cards.repeatCustomers, color: 'var(--muted)' },
                  ]}
                />
              </section>

              <section className="ci-card" aria-label="Top customers by revenue">
                <div className="ci-card-head"><h3>Top Customers</h3></div>
                <BarChart
                  ariaLabel="Top 10 customers by revenue"
                  data={overview.charts.topCustomers.map((c) => ({ label: c.customerName, value: c.totalRevenue }))}
                  formatValue={money}
                />
              </section>

              <section className="ci-card" aria-label="Top products">
                <div className="ci-card-head"><h3>Top Products</h3></div>
                <BarChart
                  ariaLabel="Top 10 products by quantity"
                  data={overview.charts.topProducts.map((p) => ({ label: p.productName, value: p.totalQty }))}
                  color="var(--success)"
                  formatValue={(v) => `${v} units`}
                />
              </section>

              <section className="ci-card" aria-label="Revenue distribution" style={{ gridColumn: '1 / -1' }}>
                <div className="ci-card-head"><h3>Revenue Distribution</h3></div>
                <BarChart
                  ariaLabel="Customers grouped by lifetime revenue band"
                  data={overview.charts.revenueDistribution.map((b) => ({ label: b.label, value: b.count }))}
                  color="var(--accent)"
                  formatValue={(v) => `${v} customer${v === 1 ? '' : 's'}`}
                />
              </section>
            </div>
          </>
        ) : null}
      </div>
    </CustomerLayout>
  );
}
