// Error screen (s-error). Same markup and copy as the original.
export default function ErrorView({ message, onRetry }) {
  return (
    <div className="screen active" id="s-error">
      <div className="err-card">
        <div className="err-icon">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="err-title">Could not extract order data</div>
        <div className="err-msg">{message || '—'}</div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '14px' }}>
        <button className="btn-rst" onClick={onRetry}>
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Try again
        </button>
      </div>
    </div>
  );
}
