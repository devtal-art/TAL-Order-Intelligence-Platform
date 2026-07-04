// Processing screen (s-proc). Renders the three steps from a status array,
// reproducing the dot/badge markup the original setStep() produced.
const STEPS = [
  { title: 'Scanning HTML', sub: 'Parsing tables, rows, and content blocks' },
  { title: 'Extracting order data', sub: 'Order info · addresses · line items · totals' },
  { title: 'Resolving products', sub: 'Checking approved item numbers' },
];

function StepDot({ status }) {
  if (status === 'run') {
    return <div className="mini-spin"></div>;
  }
  if (status === 'done') {
    return (
      <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#fff', strokeWidth: 3, strokeLinecap: 'round' }}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#94A3B8', strokeWidth: 2, strokeLinecap: 'round' }}>
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

function badgeText(status) {
  if (status === 'run') return 'Running…';
  if (status === 'done') return 'Done';
  return 'Waiting';
}

export default function ProcessingView({ steps }) {
  return (
    <div className="screen active" id="s-proc">
      <div className="proc-wrap">
        <div className="spin-ring"></div>
        <div className="proc-title">Processing your file…</div>
        <div className="proc-sub">Reading your file and resolving products</div>
      </div>
      <div className="steps-box">
        {STEPS.map((s, i) => {
          const status = steps[i] || '';
          return (
            <div className={`st${status ? ' ' + status : ''}`} key={i}>
              <div className="st-dot">
                <StepDot status={status} />
              </div>
              <div className="st-body">
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </div>
              <div className="st-tag">{badgeText(status)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
