// Horizontal ranked-bar list — plain HTML/CSS, no chart library. Chosen over
// an SVG bar chart for this use because the labels here (customer/product
// names) are long free text; horizontal bars keep labels fully readable on
// the left instead of colliding under narrow vertical columns.
export default function BarChart({ data, color = 'var(--accent)', formatValue = (v) => String(v), ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ci-hbar-chart" role="img" aria-label={ariaLabel}>
      {data.map((d) => (
        <div className="ci-hbar-row" key={d.label}>
          <span className="ci-hbar-label" title={d.label}>{d.label}</span>
          <div className="ci-hbar-track">
            <div
              className="ci-hbar-fill"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, background: color }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
          </div>
          <span className="ci-hbar-value">{formatValue(d.value)}</span>
        </div>
      ))}
      {data.length === 0 && <div className="dl-empty">No data yet.</div>}
    </div>
  );
}
