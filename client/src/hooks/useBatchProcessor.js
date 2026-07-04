import { useState, useCallback, useRef } from 'react';
import { parseOrderHTML } from '../parser/parseOrderHTML.js';
import { resolveService } from '../services/resolveService.js';
import { mappingService } from '../services/mappingService.js';
import { orderService } from '../services/orderService.js';
import { portalOrderRef } from '../utils/order.js';
import { buildBatchZip } from '../excel/buildBatchZip.js';
import { sleep } from '../utils/timing.js';

// Build the per-order resolution snapshot ({ catalogVersion, results }) from the
// shared uniqueResults map — the same join used when generating Excel.
function orderResolution(order, uniqueResults, catalogVersion) {
  const results = order.products.map((p) => {
    const resolved = uniqueResults[p.uniqueKey];
    return resolved
      ? { ...resolved, lineId: p.lineId }
      : {
          lineId: p.lineId,
          emailProductName: p.name,
          status: 'needs_review',
          confidence: 0,
          source: 'none',
          match: null,
          suggestedProduct: null,
        };
  });
  return { catalogVersion, results };
}

// ──────────────────────────────────────────────────────────────────────────────
// useBatchProcessor — V1.1 batch orchestration hook
//
// Extends the platform to process up to 50 HTML order emails as one batch.
// Key optimisation: products are resolved ONCE per unique name, then the result
// is fanned out to every occurrence across all orders.
//
// The parser (parseOrderHTML), resolve service, mapping service, and Excel
// builder (buildXLSX) are all called UNCHANGED — only the orchestration layer
// is new.
// ──────────────────────────────────────────────────────────────────────────────

// Normalise a product name for deduplication keying.
const normaliseKey = (name) => (name || '').toLowerCase().trim();

/**
 * Read a File object as UTF-8 text using FileReader.
 * Returns a Promise<string>.
 */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Cannot read file: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

export function useBatchProcessor() {
  // screen: 'idle' | 'proc' | 'review' | 'results' | 'error'
  const [screen, setScreen] = useState('idle');

  // Processing progress state
  const [batchProgress, setBatchProgress] = useState({
    totalFiles: 0,
    parsedFiles: 0,
    phase: '', // 'reading' | 'parsing' | 'resolving' | 'done'
  });

  // Core batch session:
  //   orders: [{ filename, parsedData, products: [{lineId, name, uniqueKey, pkg, qty}] }]
  //   uniqueProductMap: Map<key, { displayName, occurrences: [{orderIdx, lineId}] }>
  const [batchSession, setBatchSession] = useState(null);

  // Resolution results: Map<uniqueKey, resolveResult>
  // Using a plain object (keyed by uniqueKey) so React state updates trigger re-renders.
  const [uniqueResults, setUniqueResults] = useState({}); // { [uniqueKey]: resolveResult }

  // catalogVersion returned by Resolve API (informational)
  const [catalogVersion, setCatalogVersion] = useState(null);

  // Batch result for the results screen
  const [batchResult, setBatchResult] = useState(null); // { zipBlob, orderCount }

  const [error, setError] = useState('');

  // Latest-value refs so approveBatchProduct (stable useCallback) can mirror
  // approvals into the persisted Order documents without stale closures.
  const sessionRef = useRef(null);
  const resultsRef = useRef({});
  const catalogVersionRef = useRef(null);

  // ── Run: read, parse, deduplicate, resolve ──────────────────────────────────
  const runBatch = useCallback(async (files) => {
    if (!files || !files.length) return;

    setScreen('proc');
    setError('');
    setBatchProgress({ totalFiles: files.length, parsedFiles: 0, phase: 'reading' });

    try {
      // ── Phase 1: Read all files in parallel ──────────────────────────────
      const htmlContents = await Promise.all(files.map(readFile));
      await sleep(200);

      // ── Phase 2: Parse each file with the existing parser ─────────────────
      setBatchProgress((p) => ({ ...p, phase: 'parsing' }));
      const orders = [];
      const parseErrors = [];

      for (let i = 0; i < files.length; i++) {
        await sleep(30); // yield to UI between files
        let parsedData;
        try {
          parsedData = parseOrderHTML(htmlContents[i]);
        } catch (e) {
          parseErrors.push({ filename: files[i].name, error: e.message });
          setBatchProgress((p) => ({ ...p, parsedFiles: p.parsedFiles + 1 }));
          continue;
        }

        // Build per-order product list
        const products = (parsedData.line_items || []).map((it, idx) => ({
          lineId: `${i}-${idx + 1}`, // globally unique across all orders
          name: it.description,
          pkg: it.package,
          qty: it.qty,
          uniqueKey: normaliseKey(it.description),
        }));

        orders.push({ filename: files[i].name, parsedData, products });
        setBatchProgress((p) => ({ ...p, parsedFiles: p.parsedFiles + 1 }));
      }

      if (orders.length === 0) {
        throw new Error(
          parseErrors.length
            ? `All ${files.length} files failed to parse. First error: ${parseErrors[0].error}`
            : 'No orders could be parsed from the uploaded files.'
        );
      }

      // ── Phase 3: Build unique product dictionary ──────────────────────────
      // uniqueProductMap: Map<key, { displayName, occurrences: [{orderIdx, lineId}] }>
      const uniqueProductMap = new Map();

      orders.forEach((order, orderIdx) => {
        order.products.forEach(({ uniqueKey, name, lineId }) => {
          if (!uniqueProductMap.has(uniqueKey)) {
            uniqueProductMap.set(uniqueKey, { displayName: name, occurrences: [] });
          }
          uniqueProductMap.get(uniqueKey).occurrences.push({ orderIdx, lineId });
        });
      });

      // ── Phase 4: Resolve only unique products ─────────────────────────────
      setBatchProgress((p) => ({ ...p, phase: 'resolving' }));
      await sleep(100);

      const uniqueEntries = [...uniqueProductMap.entries()];
      const resolvePayload = uniqueEntries.map(([key, { displayName }]) => ({
        lineId: key,          // reuse key as lineId — the resolve API echoes it back
        name: displayName,
      }));

      const resolved = resolvePayload.length
        ? await resolveService.resolve(resolvePayload)
        : { catalogVersion: null, results: [] };

      // Fan resolved results back into a plain object keyed by uniqueKey
      const resultsMap = {};
      (resolved.results || []).forEach((r) => {
        resultsMap[r.lineId] = r; // lineId === uniqueKey from our payload above
      });

      await sleep(200);
      setBatchProgress((p) => ({ ...p, phase: 'done' }));

      // Store session
      const session = { orders, uniqueProductMap, parseErrors };
      setBatchSession(session);
      setUniqueResults(resultsMap);
      setCatalogVersion(resolved.catalogVersion);
      sessionRef.current = session;
      resultsRef.current = resultsMap;
      catalogVersionRef.current = resolved.catalogVersion;

      // Persist every order independently (V1.2). Best-effort — never blocks the
      // review/ZIP flow. Runs after the screen switch so the UI stays responsive.
      orders.forEach((order) => {
        const inf = order.parsedData.order_info || {};
        orderService
          .save({
            portalOrderRef: portalOrderRef(order.parsedData, order.filename),
            filename: order.filename,
            customerName: order.parsedData.billing_address?.company_name || '',
            orderDate: inf.order_date || '',
            totalProducts: order.products.length,
            parsedData: order.parsedData,
            resolutionData: orderResolution(order, resultsMap, resolved.catalogVersion),
          })
          .catch((e) => console.warn(`Order persist failed (${order.filename}):`, e.message));
      });

      setScreen('review');
    } catch (e) {
      setError(e.message || String(e));
      setScreen('error');
    }
  }, []);

  // ── Approve a unique product ───────────────────────────────────────────────
  // Creates the mapping once, re-resolves that 1 product, then updates
  // uniqueResults[uniqueKey] — React re-renders ALL cards that reference it.
  const approveBatchProduct = useCallback(async (uniqueKey, payload) => {
    try {
      await mappingService.create(payload);
    } catch (e) {
      if (e.status !== 409) throw e; // 409 = duplicate mapping, silently accepted
    }

    const resp = await resolveService.resolve([{ lineId: uniqueKey, name: payload.emailProductName }]);
    const updated = resp.results[0];

    const nextResults = { ...resultsRef.current, [uniqueKey]: updated };
    resultsRef.current = nextResults;
    setUniqueResults(nextResults);

    // Mirror into every persisted Order that contains this product (best-effort).
    const session = sessionRef.current;
    if (session) {
      session.orders
        .filter((order) => order.products.some((p) => p.uniqueKey === uniqueKey))
        .forEach((order) => {
          orderService
            .updateResolution(
              portalOrderRef(order.parsedData, order.filename),
              orderResolution(order, nextResults, catalogVersionRef.current)
            )
            .catch((e) => console.warn(`Order resolution update failed (${order.filename}):`, e.message));
        });
    }
    return updated;
  }, []);

  // ── Generate ZIP ───────────────────────────────────────────────────────────
  const generateBatchExcel = useCallback(async () => {
    if (!batchSession) return;

    // Build per-order resolution objects for buildXLSX
    const orderOutputs = batchSession.orders.map((order) => {
      // Map each order's products back to resolution results
      const orderResults = order.products.map((p) => {
        const resolved = uniqueResults[p.uniqueKey];
        return resolved
          ? { ...resolved, lineId: p.lineId }
          : {
              lineId: p.lineId,
              emailProductName: p.name,
              status: 'needs_review',
              confidence: 0,
              source: 'none',
              match: null,
              suggestedProduct: null,
            };
      });

      return {
        filename: order.filename,
        parsedData: order.parsedData,
        resolution: { catalogVersion, results: orderResults },
      };
    });

    try {
      const { zipBlob, orderCount } = await buildBatchZip(orderOutputs);
      setBatchResult({ zipBlob, orderCount });
      setScreen('results');
    } catch (e) {
      setError(e.message || 'Failed to generate ZIP');
      setScreen('error');
    }
  }, [batchSession, uniqueResults, catalogVersion]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetBatch = useCallback(() => {
    setBatchSession(null);
    setUniqueResults({});
    setBatchResult(null);
    setCatalogVersion(null);
    setError('');
    setBatchProgress({ totalFiles: 0, parsedFiles: 0, phase: '' });
    sessionRef.current = null;
    resultsRef.current = {};
    catalogVersionRef.current = null;
    setScreen('idle');
  }, []);

  // ── Derived summary stats ──────────────────────────────────────────────────
  const batchStats = batchSession
    ? (() => {
        const totalProducts = batchSession.orders.reduce((s, o) => s + o.products.length, 0);
        const uniqueCount = batchSession.uniqueProductMap.size;
        const approvedCount = Object.values(uniqueResults).filter((r) => r.status === 'approved').length;
        const needsReviewCount = Object.values(uniqueResults).filter((r) => r.status === 'needs_review').length;
        const parseErrorCount = (batchSession.parseErrors || []).length;

        return {
          filesUploaded: batchSession.orders.length + parseErrorCount,
          ordersProcessed: batchSession.orders.length,
          totalProducts,
          uniqueProducts: uniqueCount,
          previouslyApproved: approvedCount,
          needsReview: needsReviewCount,
          parseErrors: batchSession.parseErrors || [],
          canGenerate: needsReviewCount === 0,
        };
      })()
    : null;

  return {
    // State
    screen,
    batchProgress,
    batchSession,
    uniqueResults,
    batchStats,
    batchResult,
    error,
    // Actions
    runBatch,
    approveBatchProduct,
    generateBatchExcel,
    resetBatch,
  };
}
