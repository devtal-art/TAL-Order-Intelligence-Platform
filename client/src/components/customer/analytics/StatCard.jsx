// Reusable stat tile — same markup/classes CustomerFinancialSummary already
// uses (ci-stat-tile), pulled out standalone so the Analytics Dashboard's
// platform-wide cards and a customer's own financial tiles share one
// component instead of two copies of the same JSX.
export default function StatCard({ label, value, caption }) {
  return (
    <div className="ci-stat-tile">
      <div className="ci-stat-label">{label}</div>
      <div className="ci-stat-value">{value}</div>
      {caption && <div className="ci-stat-caption">{caption}</div>}
    </div>
  );
}
