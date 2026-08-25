import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { orderService } from '../services/orderService.js';
import { formatDaysUntil, formatDisplayDate } from '../utils/dateFormat.js';

// "View All" for the Order Delivery Date dashboard card — every upcoming
// delivery date (today onward), each with its order count and how many days
// away it is. Same summary payload the dashboard card itself reads
// (summary.upcomingDeliveryDates), just unfiltered by the card's 7-day
// window. Clicking a date reuses the existing per-date order list
// (/dashboard/orders?type=deliveryDate&value=<date>) — unchanged.
export default function DeliveryDatesList() {
  const [dates, setDates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .dashboard()
      .then((summary) => {
        if (!cancelled) setDates(summary.upcomingDeliveryDates || []);
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

  const rows = dates || [];

  return (
    <Layout>
      <div className="screen active" id="s-delivery-dates-list">
        <div className="dl-head">
          <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          <h2 className="dl-title">
            <span className="os-badge os-released">Delivery Dates</span>
            All upcoming delivery dates
          </h2>
          {!loading && (
            <span className="dl-total">
              {rows.length} date{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading && !dates ? (
          <div className="dw-loading">Loading delivery dates…</div>
        ) : rows.length === 0 ? (
          <div className="dl-empty">No upcoming delivery dates.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Delivery Date</th>
                  <th>Days Left</th>
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
      </div>
    </Layout>
  );
}
