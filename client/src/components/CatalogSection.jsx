import { useEffect, useRef, useState } from 'react';
import { catalogService } from '../services/catalogService.js';

// Step 1 · Website Product Catalog.
// Shows the live catalog status and uploads a new CSV (replaces the catalog).
export default function CatalogSection() {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const s = await catalogService.getStatus();
      setStatus(s);
    } catch (e) {
      setError(e.message || 'Could not load catalog status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await catalogService.upload(file);
      await loadStatus();
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const loaded = status && status.status === 'active';
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  let statusLabel = 'No catalog';
  if (loading) statusLabel = 'Checking…';
  else if (loaded) statusLabel = '✓ Catalog Loaded';

  return (
    <section className="step-card" id="catalogSection">
      <div className="step-head">
        <span className="step-badge">
          <svg viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0018 0V5" />
            <path d="M3 12a9 3 0 0018 0" />
          </svg>
        </span>
        <div className="step-headings">
          <div className="step-title">Product Catalog</div>
          <div className="step-sub">Website product list status</div>
        </div>
        <span className={`cat-status ${loaded ? 'is-ready' : 'is-empty'}`}>{statusLabel}</span>
      </div>

      <div className="cat-grid">
        <div className="cat-cell">
          <div className="cat-label">Current file</div>
          <div className="cat-value">{loaded ? status.filename : '—'}</div>
        </div>
        <div className="cat-cell">
          <div className="cat-label">Total products</div>
          <div className="cat-value">{loaded ? Number(status.productCount).toLocaleString() : '—'}</div>
        </div>
        <div className="cat-cell">
          <div className="cat-label">Last uploaded</div>
          <div className="cat-value">{loaded ? fmtDate(status.uploadedAt) : '—'}</div>
        </div>
      </div>

      <div className="cat-actions">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files[0])}
        />
        <button
          className="btn-csv"
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={uploading || loading}
        >
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {uploading ? 'Uploading…' : 'Upload CSV'}
        </button>
        {error ? (
          <span className="cat-hint" style={{ color: '#B91C1C' }}>
            {error}
          </span>
        ) : (
          <span className="cat-hint">Uploading replaces the entire catalog</span>
        )}
      </div>
    </section>
  );
}
