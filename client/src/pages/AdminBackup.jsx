import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { backupService } from '../services/backupService.js';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const fmtNum = (n) => Number(n).toLocaleString();
function fmtBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

// Admin Portal — Database Backup (new, additive, read-only). Shows what a
// backup taken right now would contain (so the admin can verify it is the
// right data), then offers the .zip download. Reuses the dl-*, sol-* and
// ae-* classes; only the summary tiles are new (admin-backup.css).
export default function AdminBackup() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    backupService
      .summary()
      .then(setSummary)
      .catch((e) => setError(e.message || 'Could not load the backup summary.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setDownloadError('');
    setNotice('');
    try {
      await backupService.download();
      setNotice('Backup downloaded. Store the file securely — it contains all data, including user accounts.');
    } catch (e) {
      setDownloadError(e.message || 'Could not create the backup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="screen active" id="s-admin-backup">
        <div className="dl-head">
          <h2 className="dl-title">
            <span className="os-badge os-released">Admin Portal</span>
            Database Backup
          </h2>
          <button className="sol-edit-btn" type="button" onClick={load} disabled={loading || busy} style={{ marginLeft: 'auto' }}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="sol-btn" type="button" onClick={download} disabled={busy || loading || Boolean(error)}>
            {busy ? 'Preparing backup…' : 'Download Backup (.zip)'}
          </button>
        </div>

        {error && <div className="sol-error">{error}</div>}
        {downloadError && <div className="sol-error">{downloadError}</div>}
        {notice && <div className="ae-notice">{notice}</div>}

        {loading && !summary ? (
          <div className="dw-loading">Loading backup summary…</div>
        ) : summary ? (
          <>
            <p className="ab-intro">
              This is exactly what the backup will contain if you download it now. Check it against what you expect, then
              download. Nothing in the database is changed or deleted.
            </p>

            <div className="ab-env">
              <div>
                <span className="ab-env-k">Database</span>
                <span className="ab-env-v">{summary.database}</span>
              </div>
              <div>
                <span className="ab-env-k">Server</span>
                <span className="ab-env-v">{summary.host}</span>
              </div>
              <div>
                <span className="ab-env-k">Summary taken</span>
                <span className="ab-env-v">{fmtDate(summary.generatedAt)}</span>
              </div>
            </div>

            <div className="ab-tiles">
              <div className="ab-tile ab-tile--hero">
                <div className="ab-tile-n">{fmtNum(summary.totalDocuments)}</div>
                <div className="ab-tile-l">Total records</div>
                <div className="ab-tile-s">
                  {summary.collections.length} collections · ≈ {fmtBytes(summary.totalSizeBytes)} of data
                </div>
              </div>
              {summary.collections.map((c) => (
                <div className="ab-tile" key={c.name}>
                  <div className="ab-tile-n">{fmtNum(c.documents)}</div>
                  <div className="ab-tile-l">{c.label}</div>
                  <div className="ab-tile-s">
                    {c.name} · {fmtBytes(c.sizeBytes)}
                  </div>
                  {c.note && <div className="ab-tile-note">{c.note}</div>}
                </div>
              ))}
            </div>

            <div className="ab-grid">
              <Breakdown title="Orders by status" total={summary.orders.total} rows={summary.orders.byStatus} />
              <Breakdown title="Orders by channel" total={summary.orders.total} rows={summary.orders.byChannel} />
              <div className="ab-card">
                <h3 className="ab-card-t">Date range &amp; accounts</h3>
                <dl className="ab-dl">
                  <dt>First order uploaded</dt>
                  <dd>{fmtDate(summary.orders.firstUploadedAt)}</dd>
                  <dt>Latest order uploaded</dt>
                  <dd>{fmtDate(summary.orders.lastUploadedAt)}</dd>
                  <dt>Latest activity logged</dt>
                  <dd>{fmtDate(summary.lastActivityAt)}</dd>
                  <dt>Admin accounts</dt>
                  <dd>{fmtNum(summary.accounts.admins)}</dd>
                  <dt>Employee accounts</dt>
                  <dd>{fmtNum(summary.accounts.employees)}</dd>
                  <dt>Deleted accounts</dt>
                  <dd>{fmtNum(summary.accounts.deleted)}</dd>
                </dl>
              </div>
            </div>

            <p className="ab-foot">
              The zip contains one file per collection above plus its indexes and a <code>manifest.json</code> listing the
              same record counts, so you can confirm the download matches this screen. It includes user accounts (password
              hashes), so store it securely.
            </p>
          </>
        ) : null}
      </div>
    </Layout>
  );
}

function Breakdown({ title, total, rows }) {
  return (
    <div className="ab-card">
      <h3 className="ab-card-t">{title}</h3>
      {rows.length === 0 ? (
        <div className="dl-muted">No orders.</div>
      ) : (
        <ul className="ab-bars">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="ab-bar-row">
                <span>{r.label}</span>
                <span className="ab-bar-n">{fmtNum(r.count)}</span>
              </div>
              <div className="ab-bar-track">
                <div className="ab-bar-fill" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
