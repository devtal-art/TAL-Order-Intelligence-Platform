// Reusable stat tile — same markup/classes CustomerFinancialSummary already
// uses (ci-stat-tile), pulled out standalone so the Analytics Dashboard's
// platform-wide cards and a customer's own financial tiles share one
// component instead of two copies of the same JSX.
// `hint` (optional): a one-line plain-English description of what the tile
// measures, pinned to the bottom of the tile under a divider.
export default function StatCard({ label, value, caption, hint }) {
  return (
    <div className="ci-stat-tile">
      <div className="ci-stat-label">{label}</div>
      <div className="ci-stat-value">{value}</div>
      {caption && <div className="ci-stat-caption">{caption}</div>}
      {hint && <div className="ci-stat-hint">{hint}</div>}
    </div>
  );
}
