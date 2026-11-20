import { useEffect, useRef, useState } from 'react';

// Ordered vs Invoiced revenue by month — plain SVG, no chart library.
// Both series are £, so they share ONE y-axis (order counts live in their own
// Monthly Orders chart rather than on a second scale here).
//   • The axis starts at the first month that has any data (leading empty
//     months are trimmed), so the line isn't flattened by blank history.
//   • The last point is the current, still-running month: its segment is
//     dashed and its label marked "(MTD)".
//   • Hover anywhere on the plot for a crosshair + tooltip with both values.
//
// `data` = [{ key, label, ordered, invoiced }] oldest → newest;
// `currentMonthKey` ('YYYY-MM') marks the still-running month.
const SERIES = [
  { key: 'ordered', label: 'Ordered value', color: 'var(--accent)' },
  { key: 'invoiced', label: 'Invoiced', color: 'var(--success)' },
];

const HEIGHT = 200;
const PAD = { top: 12, right: 14, bottom: 8, left: 56 };

// Round the axis max up to a "nice" number (1, 2, 2.5, 5 × 10^n).
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function compactMoney(v) {
  if (v >= 1_000_000) return `£${+(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `£${+(v / 1_000).toFixed(1)}k`;
  return `£${Math.round(v)}`;
}

export default function RevenueTrendChart({ data, formatValue, ariaLabel, currentMonthKey }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Trim leading months with no ordered AND no invoiced value.
  const firstIdx = data.findIndex((d) => d.ordered > 0 || d.invoiced > 0);
  const rows = firstIdx === -1 ? [] : data.slice(firstIdx);
  // The still-running month (dashed + "MTD") — passed in by the page, since
  // a date-filtered window can end in an earlier, complete month.
  const currentKey = currentMonthKey ?? null;

  if (!rows.length) {
    return <div className="ci-trend-empty">No ordered or invoiced value in this period yet.</div>;
  }

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.ordered, r.invoiced))));
  const ticks = [0, max / 2, max];

  const x = (i) => PAD.left + (rows.length > 1 ? (i / (rows.length - 1)) * innerW : innerW / 2);
  const y = (v) => PAD.top + innerH - (v / max) * innerH;

  const lastIsCurrent = rows[rows.length - 1].key === currentKey && rows.length > 1;
  const solidEnd = lastIsCurrent ? rows.length - 1 : rows.length; // exclusive

  const pathFor = (key, from, to) =>
    rows
      .slice(from, to)
      .map((r, j) => `${j === 0 ? 'M' : 'L'} ${x(from + j).toFixed(1)} ${y(r[key]).toFixed(1)}`)
      .join(' ');

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const raw = rows.length > 1 ? ((px - PAD.left) / innerW) * (rows.length - 1) : 0;
    setHover(Math.min(rows.length - 1, Math.max(0, Math.round(raw))));
  }

  const hovered = hover !== null ? rows[hover] : null;
  const tipLeft = hovered ? x(hover) : 0;
  const tipFlip = tipLeft > width * 0.6;

  return (
    <div className="ci-trend">
      <div className="ci-trend-legend">
        {SERIES.map((s) => (
          <span key={s.key} className="ci-trend-legend-item">
            <span className="ci-trend-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="ci-trend-plot" ref={wrapRef}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="ci-trend-svg"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="ci-trend-tick">
                {compactMoney(t)}
              </text>
            </g>
          ))}

          {hovered && (
            <line x1={tipLeft} x2={tipLeft} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted)" strokeWidth="1" />
          )}

          {SERIES.map((s) => (
            <g key={s.key}>
              <path d={pathFor(s.key, 0, solidEnd)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {lastIsCurrent && (
                <path
                  d={pathFor(s.key, rows.length - 2, rows.length)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              )}
              {rows.length === 1 && <circle cx={x(0)} cy={y(rows[0][s.key])} r="4" fill={s.color} />}
              {hovered && (
                <circle cx={tipLeft} cy={y(hovered[s.key])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              )}
            </g>
          ))}
        </svg>

        {hovered && (
          <div
            className="ci-trend-tip"
            style={tipFlip ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }}
          >
            <div className="ci-trend-tip-title">
              {hovered.label}
              {hovered.key === currentKey ? ' (month to date)' : ''}
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className="ci-trend-tip-row">
                <span className="ci-trend-swatch" style={{ background: s.color }} />
                <span className="ci-trend-tip-label">{s.label}</span>
                <span className="ci-trend-tip-value">{formatValue(hovered[s.key])}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ci-trend-labels" style={{ paddingLeft: PAD.left, paddingRight: PAD.right }}>
        <div className="ci-trend-labels-track">
          {rows.map((r, i) => {
            const step = Math.max(1, Math.ceil(rows.length / 7));
            const isLast = i === rows.length - 1;
            // Always show the last label; hide a thinned-out label that would
            // sit right next to it.
            const show = isLast || (i % step === 0 && rows.length - 1 - i >= step);
            const shift = rows.length === 1 ? '-50%' : isLast ? '-100%' : i === 0 ? '0' : '-50%';
            return (
              <span
                key={r.key}
                className="ci-trend-label"
                style={{
                  left: `${(rows.length > 1 ? i / (rows.length - 1) : 0.5) * 100}%`,
                  transform: `translateX(${shift})`,
                  visibility: show ? 'visible' : 'hidden',
                }}
              >
                {r.label}
                {lastIsCurrent && isLast ? ' (MTD)' : ''}
              </span>
            );
          })}
        </div>
      </div>

      <p className="ci-trend-note">
        Axis starts at the first month with data
        {lastIsCurrent ? `; ${rows[rows.length - 1].label} is dashed because the month is incomplete` : ''}. Months
        are by each order's Order Date (orders with no Order Date aren't plotted). Invoiced = Lit Invoice amount of
        Lit Invoice orders.
      </p>
    </div>
  );
}
