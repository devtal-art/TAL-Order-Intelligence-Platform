// Single-series time trend — plain SVG, no chart library. A single series
// needs no legend (the card title names it); hover tooltips are native
// <title> elements on each point, which every browser renders for free.
export default function LineChart({ data, formatValue = (v) => String(v), color = 'var(--accent)', ariaLabel, height = 180 }) {
  const width = 600; // internal coordinate space — scales responsively via viewBox
  const padding = { top: 12, right: 12, bottom: 22, left: 12 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2),
    y: padding.top + innerH - ((d.value - min) / range) * innerH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseline = padding.top + innerH;
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`
    : '';

  // Thin out labels on dense series so the text doesn't collide — show at
  // most ~8 evenly spaced labels regardless of how many points there are.
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="ci-linechart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="ci-linechart-svg" preserveAspectRatio="none">
        <line x1={padding.left} y1={baseline} x2={width - padding.right} y2={baseline} stroke="var(--border)" strokeWidth="1" />
        {areaPath && <path d={areaPath} fill={color} opacity="0.08" stroke="none" />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r="3" fill={color}>
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="ci-linechart-labels">
        {data.map((d, i) => (
          <span key={d.label} className="ci-linechart-label" style={{ visibility: i % labelStep === 0 ? 'visible' : 'hidden' }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
