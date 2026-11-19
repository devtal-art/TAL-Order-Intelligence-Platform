import { useEffect, useState } from 'react';
import { insightsService } from '../../../services/customer/insightsService.js';

// Icon per insight type — purely decorative grouping, mirrors the platform's
// existing convention of a small tinted icon per card category (see
// dw-stat-card in dash-widgets.css).
const ICONS = {
  cadence: '🔁',
  dormancy: '⏸️',
  trend: '📈',
  high_value: '⭐',
  day_preference: '📅',
  repeat_customer: '🔂',
};

// Auto-generated, data-backed insights for a customer (Phase 2, feature 5).
// Fetches independently of the profile call so a slow/failed insights
// request never blocks the rest of the profile from rendering.
export default function CustomerInsightsList({ customerName }) {
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setInsights(null);
    insightsService
      .get(customerName)
      .then((r) => {
        if (!cancelled) setInsights(r.insights);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load insights.');
      });
    return () => {
      cancelled = true;
    };
  }, [customerName]);

  return (
    <section className="ci-card" aria-label="Customer insights">
      <div className="ci-card-head">
        <h3>Business Insights</h3>
      </div>
      {error && <div className="sol-error">{error}</div>}
      {insights === null && !error ? (
        <div className="dw-loading">Generating insights…</div>
      ) : insights && insights.length === 0 ? (
        <div className="dl-empty">Not enough order history yet to generate insights.</div>
      ) : (
        <ul className="ci-insights-list">
          {(insights || []).map((i) => (
            <li className="ci-insight-row" key={i.type}>
              <span className="ci-insight-icon" aria-hidden="true">{ICONS[i.type] || '•'}</span>
              <span className="ci-insight-text">{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
