// Key-figure strip pinned to the bottom of a dashboard chart card. It fills
// the space left when a card is shorter than its neighbour in the same grid
// row. `items` = [{ label, value, sub? }].
export default function ChartStats({ items }) {
  return (
    <dl className="ci-chart-stats">
      {items.map((it) => (
        <div key={it.label} className="ci-chart-stat">
          <dt>{it.label}</dt>
          <dd>
            {it.value}
            {it.sub && <span className="ci-chart-stat-sub">{it.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
