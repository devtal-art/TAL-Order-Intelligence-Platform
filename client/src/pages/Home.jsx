import Layout from '../components/Layout.jsx';
import CatalogSection from '../components/CatalogSection.jsx';
import SavedOrderLookup from '../components/SavedOrderLookup.jsx';
import UploadStep from '../components/UploadStep.jsx';
import ProcessingView from '../components/ProcessingView.jsx';
import ReviewView from '../components/ReviewView.jsx';
import ResultsView from '../components/ResultsView.jsx';
import ErrorView from '../components/ErrorView.jsx';
import BatchProcessingView from '../components/BatchProcessingView.jsx';
import BatchReviewView from '../components/BatchReviewView.jsx';
import BatchResultsView from '../components/BatchResultsView.jsx';
import { useOrderProcessor } from '../hooks/useOrderProcessor.js';
import { useBatchProcessor } from '../hooks/useBatchProcessor.js';
import { useState, useCallback } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Home — V1.1
//
// Mode detection:
//   1 file selected  → V1 single-file flow (useOrderProcessor, unchanged)
//   2–50 files       → V1.1 batch flow (useBatchProcessor, new)
//
// The two hooks are independent; they never share state. Switching back to the
// upload screen resets whichever hook was active.
// ──────────────────────────────────────────────────────────────────────────────
export default function Home() {
  // V1 single-file hook (UNCHANGED — do not modify)
  const {
    screen: singleScreen,
    file,
    steps,
    parsed,
    resolution,
    result,
    error: singleError,
    pickFile,
    run,
    approveProduct,
    generateExcel,
    reset: resetSingle,
  } = useOrderProcessor();

  // V1.1 batch hook (new)
  const {
    screen: batchScreen,
    batchProgress,
    batchSession,
    uniqueResults,
    batchStats,
    batchResult,
    error: batchError,
    runBatch,
    approveBatchProduct,
    generateBatchExcel,
    resetBatch,
  } = useBatchProcessor();

  // Local state: the batch files array (cleared when reset)
  const [batchFiles, setBatchFiles] = useState(null); // File[] | null

  // Determines which mode we are in
  const isBatchMode = batchFiles && batchFiles.length > 0;

  // ── Upload callbacks ──
  const handlePickFile = useCallback(
    (f) => {
      // Single-file selected → clear any batch state, use V1 hook
      setBatchFiles(null);
      resetBatch();
      pickFile(f);
    },
    [pickFile, resetBatch]
  );

  const handlePickFiles = useCallback(
    (filesArr) => {
      // Multiple files → clear V1 state, switch to batch mode
      resetSingle();
      setBatchFiles(filesArr);
    },
    [resetSingle]
  );

  const handleRunBatch = useCallback(() => {
    if (batchFiles && batchFiles.length) runBatch(batchFiles);
  }, [batchFiles, runBatch]);

  const handleResetAll = useCallback(() => {
    setBatchFiles(null);
    resetSingle();
    resetBatch();
  }, [resetSingle, resetBatch]);

  // ── Render ──

  // ── BATCH mode screens ──
  if (isBatchMode || batchScreen !== 'idle') {
    if (batchScreen === 'proc') {
      return (
        <Layout>
          <BatchProcessingView batchProgress={batchProgress} />
        </Layout>
      );
    }

    if (batchScreen === 'review') {
      return (
        <Layout>
          <BatchReviewView
            batchSession={batchSession}
            uniqueResults={uniqueResults}
            batchStats={batchStats}
            onApprove={approveBatchProduct}
            onGenerate={generateBatchExcel}
            onReset={handleResetAll}
          />
        </Layout>
      );
    }

    if (batchScreen === 'results') {
      return (
        <Layout>
          <BatchResultsView
            batchResult={batchResult}
            batchStats={batchStats}
            batchSession={batchSession}
            uniqueResults={uniqueResults}
            onReset={handleResetAll}
          />
        </Layout>
      );
    }

    if (batchScreen === 'error') {
      return (
        <Layout>
          <ErrorView message={batchError} onRetry={handleResetAll} />
        </Layout>
      );
    }

    // Batch files selected but not yet started → show upload with batch chip
    return (
      <Layout>
        <div className="screen active" id="s-upload">
          <div className="dash">
            <div className="dash-grid">
              <SavedOrderLookup />
              <CatalogSection />
            </div>
            <UploadStep
              file={null}
              files={batchFiles}
              onPickFile={handlePickFile}
              onPickFiles={handlePickFiles}
              onExtract={run}
              onBatch={handleRunBatch}
            />
          </div>
        </div>
      </Layout>
    );
  }

  // ── SINGLE-FILE mode screens (V1 — unchanged) ──
  return (
    <Layout>
      {singleScreen === 'upload' && (
        <div className="screen active" id="s-upload">
          <div className="dash">
            <div className="dash-grid">
              <SavedOrderLookup />
              <CatalogSection />
            </div>
            <UploadStep
              file={file}
              files={null}
              onPickFile={handlePickFile}
              onPickFiles={handlePickFiles}
              onExtract={run}
              onBatch={handleRunBatch}
            />
          </div>
        </div>
      )}

      {singleScreen === 'proc' && <ProcessingView steps={steps} />}

      {singleScreen === 'review' && (
        <ReviewView
          results={resolution.results}
          parsedData={parsed}
          filename={file?.name || ''}
          lineItems={parsed?.line_items || []}
          currency={parsed?.financials?.currency || 'GBP'}
          onApprove={approveProduct}
          onGenerate={generateExcel}
          onReset={handleResetAll}
        />
      )}

      {singleScreen === 'results' && (
        <ResultsView
          data={result.data}
          workbook={result.workbook}
          resolution={resolution}
          filename={file?.name || ''}
          onReset={handleResetAll}
        />
      )}

      {singleScreen === 'error' && <ErrorView message={singleError} onRetry={handleResetAll} />}
    </Layout>
  );
}
