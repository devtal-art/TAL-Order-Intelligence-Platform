import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import StatCard from '../../components/customer/analytics/StatCard.jsx';
import BarChart from '../../components/customer/charts/BarChart.jsx';
import LineChart from '../../components/customer/charts/LineChart.jsx';
import DonutChart from '../../components/customer/charts/DonutChart.jsx';
import RevenueTrendChart from '../../components/customer/charts/RevenueTrendChart.jsx';
import ChartStats from '../../components/customer/charts/ChartStats.jsx';
import { analyticsService } from '../../services/customer/analyticsService.js';

// At-risk card: rows shown initially, and how many more each "View more" adds.
const AT_RISK_INITIAL = 5;
const AT_RISK_STEP = 10;

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', channel: '', group: '' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');

// Year/Month quick picks → the Order Date range they stand for.
// Year alone = 1 Jan → 31 Dec; Year + Month = that whole month.
function periodRange(year, month) {
  if (!year) return { dateFrom: '', dateTo: '' };
  if (!month) return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return { dateFrom: `${year}-${pad2(month)}-01`, dateTo: `${year}-${pad2(month)}-${pad2(lastDay)}` };
}

const fmtDate = (iso) => {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const wholeMoney = (n) => `£${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;
const money = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthLabel(key) {
  const [y, m] = String(key).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// Total / peak month / latest month of a monthly series ({ month, [field] }),
// over exactly the months the chart shows.
function seriesFigures(series, field, unit) {
  const rows = series || [];
  const total = rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
  const peak = rows.reduce((a, r) => (!a || (Number(r[field]) || 0) > (Number(a[field]) || 0) ? r : a), null);
  const last = rows[rows.length - 1];
  const fmt = (n) => Number(n || 0).toLocaleString('en-GB');
  return [
    { label: 'Total in chart', value: fmt(total), sub: `${rows.length} month${rows.length === 1 ? '' : 's'}` },
    { label: 'Best month', value: peak && peak[field] ? fmt(peak[field]) : '—', sub: peak && peak[field] ? monthLabel(peak.month) : null },
    { label: 'Latest month', value: last ? fmt(last[field]) : '—', sub: last ? monthLabel(last.month) : null },
  ].map((it) => ({ ...it, value: it.value === '—' ? it.value : `${it.value} ${unit}` }));
}

const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

// Platform-wide Analytics Dashboard (Phase 2, feature 8) — the Customer
// Intelligence module's overview page. All cards/charts come from one
// GET /customer-analytics/overview call (read-only, live-aggregated).
export default function CustomerAnalyticsDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [atRiskShown, setAtRiskShown] = useState(AT_RISK_INITIAL);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Re-fetch whenever a filter changes. The previous figures stay on screen
  // (dimmed) while the new ones load, so the page doesn't jump.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    analyticsService
      .overview(12, filters)
      .then((r) => {
        if (!cancelled) {
          setOverview(r);
          setAtRiskShown(AT_RISK_INITIAL);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Object.values(filters).some(Boolean);
  const options = overview?.filterOptions || { channels: [], groups: [], years: [] };

  // Year / Month quick picks. They only ever SET the Order Date range; the
  // dropdowns then show whichever year/month exactly matches that range, so
  // typing a custom From/To simply shows them blank again — one source of
  // truth, no conflicting filters.
  const [selYear, selMonth] = (() => {
    const { dateFrom, dateTo } = filters;
    if (!dateFrom || !dateTo) return ['', ''];
    const y = dateFrom.slice(0, 4);
    if (dateFrom === `${y}-01-01` && dateTo === `${y}-12-31`) return [y, ''];
    for (let m = 1; m <= 12; m++) {
      const r = periodRange(y, m);
      if (r.dateFrom === dateFrom && r.dateTo === dateTo) return [y, String(m)];
    }
    return ['', ''];
  })();
  const pickPeriod = (year, month) => setFilters((f) => ({ ...f, ...periodRange(year, month) }));

  // Active filters in words — shown on the page and written into the export.
  const filterLines = [];
  if (filters.dateFrom || filters.dateTo) {
    filterLines.push(
      `Order Date: ${filters.dateFrom ? fmtDate(filters.dateFrom) : 'any'} → ${filters.dateTo ? fmtDate(filters.dateTo) : 'any'}`
    );
  }
  if (filters.channel) filterLines.push(`Order Channel: ${filters.channel}`);
  if (filters.group) filterLines.push(`Customer Group: ${options.groups.find((g) => g.id === filters.group)?.name || filters.group}`);

  // The 10 tiles, defined once: rendered below and reused by the export.
  // `raw` is the plain number written to Excel; `display` is what's shown.
  const tiles = overview
    ? [
        { label: 'Total Customers', raw: overview.cards.totalCustomers, display: overview.cards.totalCustomers, caption: 'Unique customer names across all orders.' },
        { label: 'Ordered Value', raw: overview.cards.totalRevenue, display: money(overview.cards.totalRevenue), caption: 'Sum of the order Total of every order.' },
        { label: 'Repeat Customers', raw: overview.cards.repeatCustomers, display: overview.cards.repeatCustomers, caption: `Customers with 2+ orders · ${overview.cards.repeatCustomerRatePct}% of all customers.` },
        { label: 'Average Order Value', raw: overview.cards.averageOrderValue, display: money(overview.cards.averageOrderValue), caption: 'Ordered Value ÷ number of orders.' },
        { label: 'Revenue This Month', raw: overview.cards.monthlyRevenue, display: money(overview.cards.monthlyRevenue), caption: 'Sum of order Totals with an Order Date this month.' },
        { label: 'Orders This Month', raw: overview.cards.ordersThisMonth, display: overview.cards.ordersThisMonth, caption: 'Number of orders with an Order Date this month.' },
        { label: 'Invoiced Value', raw: overview.cards.invoicedValue, display: money(overview.cards.invoicedValue), caption: 'Sum of the Lit Invoice amount of every Lit Invoice order.' },
        { label: 'Lost Value', raw: overview.cards.lostValue, display: money(overview.cards.lostValue), caption: "Not Found products (QTY × price) + cancelled orders' products (QTY × price)." },
        { label: 'Pending Value', raw: overview.cards.pendingValue, display: money(overview.cards.pendingValue), caption: 'OS products: Pending Qty × price (full QTY if none entered). Excludes cancelled orders.' },
        { label: 'Fulfilment Rate', raw: overview.cards.fulfilmentRatePct, display: `${Number(overview.cards.fulfilmentRatePct || 0).toFixed(2)}%`, caption: 'Invoiced Value ÷ Ordered Value × 100.' },
      ]
    : [];

  async function handleExport() {
    if (!overview) return;
    setExporting(true);
    try {
      const { downloadAnalyticsWorkbook } = await import('../../services/customer/analyticsExport.js');
      downloadAnalyticsWorkbook({
        overview,
        tiles: tiles.map((t) => ({
          label: t.label === 'Fulfilment Rate' ? 'Fulfilment Rate (%)' : t.label,
          value: t.raw,
          caption: t.caption,
        })),
        filterLines,
        monthLabel,
      });
    } catch (e) {
      setError(e.message || 'Could not export the dashboard.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-analytics">
        <div className="dbp-top">
          <h2>Analytics Dashboard</h2>
          <p>Platform-wide customer and revenue analytics, derived live from saved orders.</p>
        </div>

        <div className="ci-dash-filters" role="search" aria-label="Dashboard filters">
          <div className="ci-filter-field ci-dash-narrow">
            <label htmlFor="ad-year">Year</label>
            <select id="ad-year" value={selYear} onChange={(e) => pickPeriod(e.target.value, '')}>
              <option value="">All years</option>
              {options.years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <div className="ci-filter-field ci-dash-narrow">
            <label htmlFor="ad-month">Month</label>
            <select
              id="ad-month"
              value={selMonth}
              disabled={!selYear}
              title={selYear ? undefined : 'Pick a year first'}
              onChange={(e) => pickPeriod(selYear, e.target.value)}
            >
              <option value="">{selYear ? 'All months' : 'Pick a year first'}</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={String(i + 1)}>{name}</option>
              ))}
            </select>
          </div>
          <div className="ci-filter-field">
            <label htmlFor="ad-from">Order Date From</label>
            <input
              id="ad-from"
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
            />
          </div>
          <div className="ci-filter-field">
            <label htmlFor="ad-to">Order Date To</label>
            <input
              id="ad-to"
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilter('dateTo', e.target.value)}
            />
          </div>
          <div className="ci-filter-field">
            <label htmlFor="ad-channel">Order Channel</label>
            <select id="ad-channel" value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)}>
              <option value="">All channels</option>
              {options.channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="ci-filter-field">
            <label htmlFor="ad-group">Customer Group</label>
            <select id="ad-group" value={filters.group} onChange={(e) => setFilter('group', e.target.value)}>
              <option value="">All customers</option>
              {options.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button type="button" className="ci-dash-clear" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
          <button
            type="button"
            className="ci-export-btn ci-dash-export"
            onClick={handleExport}
            disabled={exporting || loading || !overview}
            title={hasFilters ? 'Export the dashboard for the current filters (Excel)' : 'Export the dashboard (Excel)'}
          >
            {exporting ? (
              <span className="ci-export-spin" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
        {hasFilters && (
          <div className="ci-dash-filter-note">
            Showing: {filterLines.join(' · ')}
            {(filters.dateFrom || filters.dateTo) && ' — the At-risk list ignores the date range (it always counts days up to today).'}
          </div>
        )}

        {error && <div className="sol-error">{error}</div>}

        {!overview && !error ? (
          <div className="dw-loading">Loading analytics…</div>
        ) : overview ? (
          <div className={loading ? 'ci-dash-body is-loading' : 'ci-dash-body'} aria-busy={loading}>
            <div className="ci-analytics-cards">
              {tiles.map((t) => (
                <StatCard key={t.label} label={t.label} value={t.display} caption={t.caption} />
              ))}
            </div>

            <div className="ci-charts-grid">
              <section className="ci-card" aria-label="Ordered and invoiced revenue trend">
                <div className="ci-card-head"><h3>Ordered &amp; Invoiced Revenue</h3></div>
                <RevenueTrendChart
                  ariaLabel="Monthly ordered value and invoiced value"
                  currentMonthKey={overview.currentMonth}
                  data={overview.charts.revenueTrend.map((m) => ({
                    key: m.month,
                    label: monthLabel(m.month),
                    ordered: Number(m.revenue) || 0,
                    invoiced: Number(m.invoiced) || 0,
                  }))}
                  formatValue={money}
                />
              </section>

              <section className="ci-card ci-card--fill" aria-label="Customer growth">
                <div className="ci-card-head"><h3>Customer Growth</h3><span className="ci-card-sub">New customers per month</span></div>
                <div className="ci-card-body">
                  <LineChart
                    ariaLabel="New customers per month, last 12 months"
                    data={overview.charts.customerGrowth.map((m) => ({ label: monthLabel(m.month), value: m.newCustomers }))}
                    color="var(--success)"
                  />
                </div>
                <ChartStats items={seriesFigures(overview.charts.customerGrowth, 'newCustomers', 'new')} />
              </section>

              <section className="ci-card ci-card--fill" aria-label="Monthly orders">
                <div className="ci-card-head"><h3>Monthly Orders</h3><span className="ci-card-sub">Orders per Order Date month</span></div>
                <div className="ci-card-body">
                  <LineChart
                    ariaLabel="Order count per month, last 12 months"
                    data={overview.charts.monthlyOrders.map((m) => ({ label: monthLabel(m.month), value: m.orders }))}
                    color="var(--warn-icon)"
                  />
                </div>
                <ChartStats items={seriesFigures(overview.charts.monthlyOrders, 'orders', 'orders')} />
              </section>

              <section className="ci-card ci-card--fill" aria-label="Repeat vs new customers">
                <div className="ci-card-head"><h3>Repeat vs. New Customers</h3></div>
                <div className="ci-card-body ci-card-body--center">
                  <DonutChart
                    ariaLabel="Repeat vs new customers"
                    data={[
                      { label: 'Repeat', value: overview.cards.repeatCustomers, color: 'var(--success)' },
                      { label: 'One-time', value: overview.cards.totalCustomers - overview.cards.repeatCustomers, color: 'var(--muted)' },
                    ]}
                  />
                </div>
                <ChartStats
                  items={[
                    { label: 'Total customers', value: Number(overview.cards.totalCustomers).toLocaleString('en-GB') },
                    { label: 'Repeat (2+ orders)', value: pct(overview.cards.repeatCustomers, overview.cards.totalCustomers) },
                    { label: 'One-time (1 order)', value: pct(overview.cards.totalCustomers - overview.cards.repeatCustomers, overview.cards.totalCustomers) },
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

              <section className="ci-card" aria-label="At-risk customers">
                <div className="ci-card-head"><h3>At-risk customers</h3></div>
                {overview.atRiskCustomers?.length ? (
                  <>
                  <ul className="ci-atrisk-list">
                    {overview.atRiskCustomers.slice(0, atRiskShown).map((c) => (
                      <li key={c.customerName} className="ci-atrisk-row">
                        <Link className="ci-atrisk-name" to={`/customers/${encodeURIComponent(c.customerName)}`}>
                          {c.customerName}
                        </Link>
                        <span className="ci-atrisk-meta">
                          {c.daysSinceLastOrder} days · {wholeMoney(c.lifetimeValue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {overview.atRiskCustomers.length > AT_RISK_INITIAL && (
                    <div className="ci-atrisk-more">
                      <span className="ci-atrisk-count">
                        Showing {Math.min(atRiskShown, overview.atRiskCustomers.length)} of {overview.atRiskCustomers.length}
                      </span>
                      {atRiskShown < overview.atRiskCustomers.length ? (
                        <button type="button" className="ci-atrisk-btn" onClick={() => setAtRiskShown((n) => n + AT_RISK_STEP)}>
                          View more
                        </button>
                      ) : (
                        <button type="button" className="ci-atrisk-btn" onClick={() => setAtRiskShown(AT_RISK_INITIAL)}>
                          Show less
                        </button>
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <div className="ci-atrisk-empty">No customers are currently at risk.</div>
                )}
                <p className="ci-trend-note">
                  Days since last Order Date · lifetime value. At risk = no order for longer than 30 days or 1.5× the
                  customer's usual gap between orders, whichever is longer. Based on each order's Order Date. Longest
                  silent first.
                </p>
              </section>

              <section className="ci-card ci-card--fill" aria-label="Revenue distribution">
                <div className="ci-card-head"><h3>Revenue Distribution</h3><span className="ci-card-sub">Customers by revenue band</span></div>
                <div className="ci-card-body">
                  <BarChart
                    ariaLabel="Customers grouped by lifetime revenue band"
                    data={overview.charts.revenueDistribution.map((b) => ({ label: b.label, value: b.count }))}
                    color="var(--accent)"
                    formatValue={(v) => `${v} customer${v === 1 ? '' : 's'}`}
                  />
                </div>
                {(() => {
                  const bands = overview.charts.revenueDistribution;
                  const total = bands.reduce((s, b) => s + b.count, 0);
                  const under1k = bands.slice(0, 2).reduce((s, b) => s + b.count, 0);
                  const over5k = bands.slice(-2).reduce((s, b) => s + b.count, 0);
                  return (
                    <ChartStats
                      items={[
                        { label: 'Avg revenue / customer', value: wholeMoney(overview.cards.averageRevenue) },
                        { label: `Under ${bands[2]?.label.split(' - ')[0] || '£1,000'}`, value: `${under1k} customers`, sub: pct(under1k, total) },
                        { label: `${bands[bands.length - 2]?.label.split(' - ')[0] || '£5,000'}+`, value: `${over5k} customers`, sub: pct(over5k, total) },
                      ]}
                    />
                  );
                })()}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </CustomerLayout>
  );
}
