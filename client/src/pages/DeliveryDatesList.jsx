import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { orderService } from '../services/orderService.js';
import { formatDaysUntil, formatDisplayDate } from '../utils/dateFormat.js';

// "View All" for the Order Delivery Date dashboard card (V5.3 — bifurcated
// into Upcoming and Crossed sections, mirroring the dashboard's two cards).
// Upcoming: today onward, soonest first. Crossed: before today, most recent
// first. Same summary payload both dashboard cards read
// (summary.upcomingDeliveryDates / summary.crossedDeliveryDates), just
// unfiltered by either card's 7-date cap. Clicking a date reuses the
// existing per-date order list (/dashboard/orders?type=deliveryDate&value=<date>).
export default function DeliveryDatesList() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .dashboard()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load delivery dates.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = summary?.upcomingDeliveryDates || [];
  const crossed = summary?.crossedDeliveryDates || [];

  return (
    <Layout>
      <div className="screen active" id="s-delivery-dates-list">
        <div className="dl-head">
          <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          <h2 className="dl-title">
            <span className="os-badge os-released">Delivery Dates</span>
            All delivery dates
          </h2>
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading && !summary ? (
          <div className="dw-loading">Loading delivery dates…</div>
        ) : (
          <div className="ddl-sections">
            <DeliveryDatesSection title="Upcoming" rows={upcoming} emptyText="No upcoming delivery dates." columnLabel="Days Left" />
            <DeliveryDatesSection title="Crossed" rows={crossed} emptyText="No crossed delivery dates." columnLabel="Days Ago" alert />
          </div>
        )}
      </div>
    </Layout>
  );
}

// `alert` (used only by the Crossed section) styles the section red once it
// actually has rows — an overdue delivery date should read with the same
// urgency here as it does in the dashboard's Crossed Delivery Dates card.
// An empty Crossed section stays neutral (nothing to flag).
function DeliveryDatesSection({ title, rows, emptyText, columnLabel, alert = false }) {
  const isAlert = alert && rows.length > 0;
  return (
    <section className={`ddl-section${isAlert ? ' ddl-section--alert' : ''}`}>
      <div className="ddl-section-head">
        <h3 className="ddl-section-title">{title}</h3>
        <span className="dl-total">
          {rows.length} date{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="dl-empty">{emptyText}</div>
      ) : (
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Delivery Date</th>
                <th>{columnLabel}</th>
                <th className="dl-num">Orders</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date}>
                  <td className="dl-ref">{formatDisplayDate(d.date)}</td>
                  <td>{formatDaysUntil(d.daysUntil)}</td>
                  <td className="dl-num">{d.count}</td>
                  <td className="dl-act">
                    <Link className="dw-view" to={`/dashboard/orders?type=deliveryDate&value=${encodeURIComponent(d.date)}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
