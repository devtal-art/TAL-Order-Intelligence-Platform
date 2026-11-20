import { currencySymbol } from '../../../utils/format.js';
import RevenueTrendChart from '../charts/RevenueTrendChart.jsx';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
function monthLabel(key) {
  const [y, m] = String(key).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// Fill every month from the customer's first Order Date month through the
// current month, so gaps and recent inactivity show on the chart as £0.
function continuousMonths(monthlyValues, now = new Date()) {
  if (!monthlyValues.length) return [];
  const byKey = new Map(monthlyValues.map((m) => [m.month, m]));
  const [fy, fm] = monthlyValues[0].month.split('-').map(Number);
  const lastData = monthlyValues[monthlyValues.length - 1].month;
  const endKey = lastData > keyOf(now) ? lastData : keyOf(now);
  const out = [];
  for (let d = new Date(fy, fm - 1, 1); keyOf(d) <= endKey; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const k = keyOf(d);
    const m = byKey.get(k);
    out.push({ key: k, label: monthLabel(k), ordered: m?.ordered || 0, invoiced: m?.invoiced || 0 });
  }
  return out;
}

// Finance tab: Ordered vs Invoiced by Order Date month, the month-by-month
// figures behind it, and yearly revenue.
export default function ProfileFinanceTab({ profile }) {
  const sym = currencySymbol(profile.currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const monthly = profile.monthlyValues || [];
  const chartData = continuousMonths(monthly);
  const newestFirst = [...monthly].reverse();

  return (
    <div className="ci-profile-grid">
      <section className="ci-card" aria-label="Ordered vs invoiced revenue">
        <div className="ci-card-head">
          <h3>Ordered vs Invoiced Revenue</h3>
          <span className="ci-card-sub">By Order Date month</span>
        </div>
        {chartData.length === 0 ? (
          <div className="dl-empty">No orders with an Order Date yet.</div>
        ) : (
          <RevenueTrendChart
            ariaLabel="Ordered vs invoiced revenue by month"
            data={chartData}
            formatValue={money}
            currentMonthKey={keyOf(new Date())}
          />
        )}
      </section>

      <div className="ci-profile-split">
        <section className="ci-card" aria-label="Monthly breakdown">
          <div className="ci-card-head">
            <h3>Monthly Breakdown</h3>
            <span className="ci-card-sub">Months with orders</span>
          </div>
          {newestFirst.length === 0 ? (
            <div className="dl-empty">No revenue data yet.</div>
          ) : (
            <div className="dl-table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="dl-num">Orders</th>
                    <th className="dl-num">Ordered</th>
                    <th className="dl-num">Invoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="dl-num">{m.orders}</td>
                      <td className="dl-num">{money(m.ordered)}</td>
                      <td className="dl-num">{money(m.invoiced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
    </div>
  );
}
