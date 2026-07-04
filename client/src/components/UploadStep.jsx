import { useRef, useState } from 'react';
import { fmtSz } from '../utils/format.js';

const MAX_FILES = 50;
const VALID_EXTS = /\.(html?|htm)$/i;

/** Validate an array of File objects. Returns { valid, errors }. */
function validateFiles(files) {
  const errors = [];
  const valid = [];
  for (const f of files) {
    if (!VALID_EXTS.test(f.name)) {
      errors.push(`"${f.name}" is not an HTML file.`);
    } else {
      valid.push(f);
    }
  }
  if (valid.length > MAX_FILES) {
    errors.push(`Maximum ${MAX_FILES} files allowed. You selected ${valid.length} — only the first ${MAX_FILES} will be used.`);
    valid.splice(MAX_FILES);
  }
  return { valid, errors };
}

// ──────────────────────────────────────────────────────────────────────────────
// UploadStep — V1.1: supports single OR multiple HTML files.
//
// Single file (1):  existing V1 behaviour — file chip + "Extract & Build Excel"
// Multiple files (2–50): shows file count chip + "Process Batch" button.
//
// Props:
//   file       — single File (V1 single mode; null in batch mode)
//   files      — File[] (batch mode; null in single mode)
//   onPickFile — (file: File) => void  — single-file callback (V1 unchanged)
//   onPickFiles— (files: File[]) => void — batch callback
//   onExtract  — () => void  — trigger single-file processing
//   onBatch    — () => void  — trigger batch processing
// ──────────────────────────────────────────────────────────────────────────────
export default function UploadStep({ file, files, onPickFile, onPickFiles, onExtract, onBatch }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  const openPicker = () => inputRef.current && inputRef.current.click();

  const handleFilesChosen = (rawFiles) => {
    setValidationErrors([]);
    const arr = Array.from(rawFiles);
    if (arr.length === 0) return;

    if (arr.length === 1) {
      // V1 single-file path — unchanged behaviour
      const f = arr[0];
      if (!VALID_EXTS.test(f.name)) {
        setValidationErrors([`"${f.name}" is not an HTML file.`]);
        return;
      }
      onPickFile(f);
    } else {
      // Batch path
      const { valid, errors } = validateFiles(arr);
      if (errors.length) setValidationErrors(errors);
      if (valid.length) onPickFiles(valid);
    }
  };

  // Determine display mode
  const isBatch = files && files.length > 0;
  const isSingle = !isBatch && !!file;

  const totalSize = isBatch ? files.reduce((s, f) => s + f.size, 0) : 0;

  return (
    <section className="step-card upload-card">
      <div className="step-head">
        <span className="step-badge">
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <div className="step-headings">
          <div className="step-title">Upload HTML Files</div>
          <div className="step-sub">
            {isBatch
              ? `Processing up to ${MAX_FILES} saved order emails as one batch`
              : 'Parse saved order emails into structured data'}
          </div>
        </div>
        <div className="upload-modes">
          <span className="upload-mode">Single HTML</span>
          <span className="upload-mode">Batch · up to {MAX_FILES}</span>
        </div>
      </div>

      <div
        className={`dz${dragging ? ' drag' : ''}`}
        tabIndex={0}
        role="button"
        aria-label="Upload HTML files"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPicker();
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFilesChosen(e.dataTransfer.files);
        }}
      >
        <div className="dz-ring">
          <svg viewBox="0 0 24 24">
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
          </svg>
        </div>
        <div className="dz-title">Drop your HTML file{isBatch ? 's' : ''} here</div>
        <div className="dz-sub">
          or{' '}
          <span className="dz-link" onClick={(e) => { e.stopPropagation(); openPicker(); }}>
            browse to upload
          </span>
        </div>
        <div className="fmt-row">
          <span className="fmt">.html</span>
          <span className="fmt">.htm</span>
        </div>
      </div>

      {/* Hidden file input — multiple enabled */}
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files.length) handleFilesChosen(e.target.files);
          // Reset input so the same file(s) can be re-selected if needed
          e.target.value = '';
        }}
      />

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="upload-errors">
          {validationErrors.map((err, i) => (
            <div key={i} className="upload-error-row">⚠ {err}</div>
          ))}
        </div>
      )}

      {/* ── Single-file chip (V1 unchanged) ── */}
      <div className={`fc${isSingle ? ' show' : ''}`}>
        <div className="fc-icon">
          <svg viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="fc-info">
          <div className="fc-name">{file ? file.name : ''}</div>
          <div className="fc-size">{file ? fmtSz(file.size) : ''}</div>
        </div>
        <button className="btn-go" onClick={onExtract}>
          <svg viewBox="0 0 24 24">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Extract &amp; Build Excel
        </button>
      </div>

      {/* ── Batch chip (multi-file) ── */}
      {isBatch && (
        <div className="fc show batch-fc">
          <div className="batch-fc-icon">
            <svg viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              <path d="M12 11v6M9 14l3 3 3-3" />
            </svg>
          </div>
          <div className="fc-info">
            <div className="fc-name">
              {files.length} HTML file{files.length !== 1 ? 's' : ''} selected
            </div>
            <div className="fc-size">
              {fmtSz(totalSize)} total · Batch mode
            </div>
          </div>
          <button className="btn-go btn-batch" onClick={onBatch}>
            <svg viewBox="0 0 24 24">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Process Batch
          </button>
        </div>
      )}
    </section>
  );
}
