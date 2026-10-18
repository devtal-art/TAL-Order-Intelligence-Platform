import Layout from '../components/Layout.jsx';
import CatalogSection from '../components/CatalogSection.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import DuplicateOrderView from '../components/DuplicateOrderView.jsx';
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
import { useNavigate } from 'react-router-dom';

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
    comments,
    fulfillment,
    notes,
    orderStatus,
    setOrderStatus,
    orderComment,
    setOrderComment,
    deliveryDate,
    setDeliveryDate,
    litInvoice,
    setLitInvoice,
    saveError,
    saved,
    pending,
    pickFile,
    run,
    approveProduct,
    addProduct,
    removeProduct,
    setProductComment,
    setProductFulfillment,
    setProductNote,
    saveOrder,
    continueDuplicate,
    updateDuplicateOrder,
    generateExcel,
    reset: resetSingle,
    customerDays,
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

  // V3.1 (Manual Order Creation, additive): second entry point alongside HTML
  // upload — navigates to its own page/route, no shared state with either hook.
  const navigate = useNavigate();

  // Duplicate-upload flow (V1.9): whether the existing order's detail modal
  // is open on top of the duplicate screen.
  const [dupOpen, setDupOpen] = useState(false);

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
    setDupOpen(false);
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
            {/* V2.2: Saved Order Search lives on the Dashboard page now —
                this screen is dedicated to creating new orders. */}
            <CatalogSection />
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
            {/* V2.2: Saved Order Search lives on the Dashboard page now —
                this screen is dedicated to creating new orders. */}
            <CatalogSection />
            <UploadStep
              file={file}
              files={null}
              onPickFile={handlePickFile}
              onPickFiles={handlePickFiles}
              onExtract={run}
              onBatch={handleRunBatch}
            />

            {/* V3.1 (Manual Order Creation, additive): second, independent entry
                point — does not read or touch any HTML-upload state above. */}
            <div className="mo-entry-card">
              <div className="mo-entry-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div className="mo-entry-text">
                <div className="mo-entry-title">No HTML email for this order?</div>
                <div className="mo-entry-sub">Create a manual order — it&apos;s saved and tracked exactly like an uploaded one.</div>
              </div>
              <button type="button" className="mo-entry-btn" onClick={() => navigate('/orders/manual')}>
                Create Manual Order
              </button>
            </div>
          </div>
        </div>
      )}

      {singleScreen === 'proc' && <ProcessingView steps={steps} />}

      {singleScreen === 'duplicate' && pending && (
        <>
          <DuplicateOrderView
            order={pending.prev}
            onOpenExisting={() => setDupOpen(true)}
            onContinue={continueDuplicate}
            onCancel={handleResetAll}
          />
          {dupOpen && (
            <SavedOrderDetailModal
              order={pending.prev}
              onClose={() => setDupOpen(false)}
              onDownload={() => downloadOrderExcel(pending.prev)}
              onSaved={updateDuplicateOrder}
            />
          )}
        </>
      )}

      {singleScreen === 'review' && (
        <ReviewView
          results={resolution.results}
          parsedData={parsed}
          filename={file?.name || ''}
          lineItems={parsed?.line_items || []}
          currency={parsed?.financials?.currency || 'GBP'}
          comments={comments}
          fulfillment={fulfillment}
          notes={notes}
          onApprove={approveProduct}
          onAddProduct={addProduct}
          onRemoveProduct={removeProduct}
          onComment={setProductComment}
          onFulfillment={setProductFulfillment}
          onNote={setProductNote}
          onSave={saveOrder}
          saved={saved}
          orderStatus={orderStatus}
          onOrderStatus={setOrderStatus}
          orderComment={orderComment}
          onOrderComment={setOrderComment}
          deliveryDate={deliveryDate}
          onDeliveryDate={setDeliveryDate}
          litInvoice={litInvoice}
          onLitInvoice={setLitInvoice}
          saveError={saveError}
          customerDays={customerDays}
          onGenerate={generateExcel}
          onReset={handleResetAll}
        />
      )}

      {singleScreen === 'results' && (
        <ResultsView
          data={result.data}
          workbook={result.workbook}
          resolution={resolution}
          comments={comments}
          filename={file?.name || ''}
          onReset={handleResetAll}
        />
      )}

      {singleScreen === 'error' && <ErrorView message={singleError} onRetry={handleResetAll} />}
    </Layout>
  );
}
