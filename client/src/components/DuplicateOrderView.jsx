// Duplicate upload screen (V1.9). Shown when the uploaded HTML's Portal Order
// Ref already exists in the database — BEFORE anything is saved. Displays the
// existing order's identity and lets the user open it directly (no manual
// search), re-process the upload to update it (the established re-upload
// workflow: refreshes parsing, keeps manual products/comments/notes), or
// cancel the upload entirely.
export default function DuplicateOrderView({ order, onOpenExisting, onContinue, onCancel }) {
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="screen active" id="s-duplicate">
      <div className="dup-card" role="alertdialog" aria-label="Order already exists">
        <div className="dup-badge">
          <svg viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="dup-title">Order already exists</h2>
        <p className="dup-sub">
          This Portal Order Ref has already been processed and saved. Nothing has been overwritten.
        </p>

        <div className="dup-grid">
          <div className="dup-item">
            <span className="dup-k">Order Reference</span>
            <b className="dup-v">{order.portalOrderRef}</b>
          </div>
          <div className="dup-item">
            <span className="dup-k">Processed By</span>
            <b className="dup-v">{order.processedBy || 'Not Assigned'}</b>
          </div>
          <div className="dup-item">
            <span className="dup-k">Saved Date</span>
            <b className="dup-v">{fmtDate(order.uploadTimestamp)}</b>
          </div>
          <div className="dup-item">
            <span className="dup-k">Customer Name</span>
            <b className="dup-v">{order.customerName || '—'}</b>
          </div>
        </div>

        <div className="dup-actions">
          <button className="dup-open" type="button" onClick={onOpenExisting}>
            Open Existing Order
          </button>
          <button className="dup-update" type="button" onClick={onContinue} title="Re-parse this HTML and update the saved order — manual products, comments and notes are kept">
            Re-process &amp; Update
          </button>
          <button className="dup-cancel" type="button" onClick={onCancel}>
            Cancel Upload
          </button>
        </div>
      </div>
    </div>
  );
}
