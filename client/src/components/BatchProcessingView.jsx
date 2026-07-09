// Batch processing screen — shows live progress during multi-file batch.
// Replaces the single-file ProcessingView for batch mode only.
// The existing ProcessingView is NOT modified.

const BATCH_STEPS = [
  { key: 'reading',   title: 'Reading files',          sub: 'Loading HTML content from disk' },
  { key: 'parsing',   title: 'Parsing orders',          sub: 'Extracting order data from each file' },
  { key: 'resolving', title: 'Resolving unique products', sub: 'Checking approved item numbers (deduplicated)' },
];

function StepDot({ active, done }) {
  if (active) return <div className="mini-spin" />;
  if (done) {
    return (
      <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#fff', strokeWidth: 3, strokeLinecap: 'round' }}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#A8A29E', strokeWidth: 2, strokeLinecap: 'round' }}>
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

export default function BatchProcessingView({ batchProgress }) {
  const { totalFiles, parsedFiles, phase } = batchProgress;

  const phaseIndex = BATCH_STEPS.findIndex((s) => s.key === phase);
  const pct = totalFiles > 0 ? Math.round((parsedFiles / totalFiles) * 100) : 0;

  return (
    <div className="screen active" id="s-proc">
      <div className="proc-wrap">
        <div className="spin-ring" />
        <div className="proc-title">Processing batch…</div>
        <div className="proc-sub">
          {phase === 'parsing'
            ? `Parsing file ${Math.min(parsedFiles + 1, totalFiles)} of ${totalFiles}`
            : phase === 'resolving'
            ? 'Resolving unique products against catalog'
            : phase === 'reading'
            ? `Reading ${totalFiles} file${totalFiles !== 1 ? 's' : ''}…`
            : 'Preparing…'}
        </div>

        {/* Progress bar — only shown during parsing phase */}
        {phase === 'parsing' && totalFiles > 0 && (
          <div className="batch-prog-track">
            <div className="batch-prog-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
        {phase === 'parsing' && totalFiles > 0 && (
          <div className="batch-prog-label">
            {parsedFiles} / {totalFiles} files parsed
          </div>
        )}
      </div>

      <div className="steps-box">
        {BATCH_STEPS.map((step, i) => {
          const isDone = phaseIndex > i;
          const isActive = phaseIndex === i;
          const status = isDone ? 'done' : isActive ? 'run' : '';
          return (
            <div className={`st${status ? ' ' + status : ''}`} key={step.key}>
              <div className="st-dot">
                <StepDot active={isActive} done={isDone} />
              </div>
              <div className="st-body">
                <strong>{step.title}</strong>
                <span>{step.sub}</span>
              </div>
              <div className="st-tag">
                {isDone ? 'Done' : isActive ? 'Running…' : 'Waiting'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
