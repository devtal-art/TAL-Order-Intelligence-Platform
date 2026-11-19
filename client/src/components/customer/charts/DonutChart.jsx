// Small multi-slice donut — plain SVG, no chart library. Used only for
// genuinely categorical splits (e.g. repeat vs. one-time customers), so a
// legend is always rendered alongside it (≥2 series never rely on color alone).
export default function DonutChart({ data, ariaLabel, size = 140, thickness = 18 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="ci-donut" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={thickness} />
          {data.map((d) => {
            const frac = d.value / total;
            const dash = frac * circumference;
            const circle = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
              </circle>
            );
            offset += dash;
            return circle;
          })}
        </g>
      </svg>
      <ul className="ci-donut-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className="ci-donut-swatch" style={{ background: d.color }} />
            {d.label} — {d.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
