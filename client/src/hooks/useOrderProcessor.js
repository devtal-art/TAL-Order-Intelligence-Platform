import { useState, useCallback, useRef } from 'react';
import { parseOrderHTML } from '../parser/parseOrderHTML.js';
import { buildXLSX } from '../excel/buildXLSX.js';
import { resolveService } from '../services/resolveService.js';
import { mappingService } from '../services/mappingService.js';
import { orderService } from '../services/orderService.js';
import { portalOrderRef } from '../utils/order.js';
import { sleep } from '../utils/timing.js';

// Orchestrates the flow: upload → parse → resolve → review → (generate) Excel.
// The parser and Excel builder are used unchanged; resolution is inserted
// between parsing and Excel generation.
export function useOrderProcessor() {
  const [screen, setScreen] = useState('upload'); // 'upload' | 'proc' | 'review' | 'results' | 'error'
  const [file, setFile] = useState(null);
  const [steps, setSteps] = useState(['', '', '']); // '' | 'run' | 'done'
  const [parsed, setParsed] = useState(null); // parseOrderHTML output
  const [resolution, setResolution] = useState(null); // resolve API response
  const [result, setResult] = useState(null); // { data, workbook }
  const [error, setError] = useState('');
  const [comments, setComments] = useState({}); // { [lineId]: 'Released' | 'OS' | 'N/A' } (V1.3)
  const [fulfillment, setFulfillment] = useState({}); // { [lineId]: { pendingQty, status } } (V1.4)
  const orderRefRef = useRef(null); // Portal Order Ref of the persisted order (for approval updates)

  const setStepStatus = (i, status) =>
    setSteps((prev) => {
      const next = [...prev];
      next[i] = status;
      return next;
    });

  const pickFile = useCallback((f) => setFile(f), []);

  const run = useCallback(async () => {
    if (!file) return;
    setScreen('proc');
    setSteps(['', '', '']);
    setComments({});
    setFulfillment({});
    try {
      setStepStatus(0, 'run');
      const html = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result);
        r.onerror = () => rej(new Error('Cannot read file'));
        r.readAsText(file, 'utf-8');
      });
      await sleep(400);
      setStepStatus(0, 'done');

      setStepStatus(1, 'run');
      await sleep(100);
      const data = parseOrderHTML(html);
      if (!data.line_items.length && !data.order_info.order_ref && !data.financials.total) {
        throw new Error('No order data found. Make sure the file is a saved HTML order email. Check the file opens correctly in a browser.');
      }
      await sleep(400);
      setStepStatus(1, 'done');

      // Resolve extracted products against the Approved Mapping database.
      setStepStatus(2, 'run');
      await sleep(100);
      const products = (data.line_items || []).map((it, i) => ({
        lineId: String(i + 1),
        name: it.description,
        package: it.package,
        qty: it.qty,
      }));
      const resolved = products.length
        ? await resolveService.resolve(products)
        : { catalogVersion: null, results: [] };
      await sleep(400);
      setStepStatus(2, 'done');

      await sleep(300);
      setParsed(data);
      setResolution(resolved);

      // Persist the order (V1.2). Best-effort: a DB/API failure must not block
      // the existing parse → review → Excel flow.
      const ref = portalOrderRef(data, file.name);
      orderRefRef.current = ref;
      orderService
        .save({
          portalOrderRef: ref,
          filename: file.name,
          customerName: data.billing_address?.company_name || '',
          orderDate: data.order_info?.order_date || '',
          totalProducts: (data.line_items || []).length,
          parsedData: data,
          resolutionData: resolved,
        })
        .catch((e) => console.warn('Order persist failed:', e.message));

      setScreen('review');
    } catch (e) {
      setError(e.message || String(e));
      setScreen('error');
    }
  }, [file]);

  // Manual approval for a single product. Creates the mapping, tolerates a
  // duplicate (409) silently, then re-runs Resolve for ONLY that product and
  // updates just that card + the progress summary — no page/HTML refresh.
  const approveProduct = useCallback(async (lineId, payload) => {
    try {
      await mappingService.create(payload);
    } catch (e) {
      if (e.status !== 409) throw e; // duplicate is fine; anything else is a real error
    }
    const resp = await resolveService.resolve([{ lineId, name: payload.emailProductName }]);
    const updated = resp.results[0];
    let nextResolution = null;
    setResolution((prev) => {
      nextResolution = { ...prev, results: prev.results.map((r) => (r.lineId === lineId ? updated : r)) };
      return nextResolution;
    });

    // Mirror the approval into the persisted Order (best-effort).
    if (orderRefRef.current && nextResolution) {
      orderService
        .updateResolution(orderRefRef.current, nextResolution)
        .catch((e) => console.warn('Order resolution update failed:', e.message));
    }
    return updated;
  }, []);

  // Set (or clear, with '') the fulfilment comment of one product on the
  // Preview/Review screen. Mirrors to the persisted Order (best-effort, like
  // the other order writes) so the value is saved together with the order.
  const setProductComment = useCallback((lineId, value) => {
    setComments((prev) => {
      const next = { ...prev };
      if (value) next[lineId] = value;
      else delete next[lineId];
      return next;
    });
    if (orderRefRef.current) {
      orderService
        .setComments(orderRefRef.current, { [lineId]: value || null })
        .catch((e) => console.warn('Order comment update failed:', e.message));
    }
  }, []);

  // Set one product's delivery tracking on the Preview/Review screen (V1.4).
  // `patch` = { pendingQty?, status? } — merged into the line's entry. Mirrors
  // to the persisted Order (best-effort, like comments) so it is saved with
  // the order.
  const setProductFulfillment = useCallback((lineId, patch) => {
    setFulfillment((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
    if (orderRefRef.current) {
      orderService
        .setFulfillment(orderRefRef.current, { [lineId]: patch })
        .catch((e) => console.warn('Order fulfillment update failed:', e.message));
    }
  }, []);

  // Build the Excel workbook from the parsed data plus resolution (extended
  // buildXLSX) and show the results screen. Triggered from the Review screen.
  const generateExcel = useCallback(() => {
    if (!parsed) return;
    const workbook = buildXLSX(parsed, resolution);
    setResult({ data: parsed, workbook });
    setScreen('results');
  }, [parsed, resolution]);

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setResolution(null);
    setResult(null);
    setError('');
    setComments({});
    setFulfillment({});
    setSteps(['', '', '']);
    setScreen('upload');
  }, []);

  return { screen, file, steps, parsed, resolution, result, error, comments, fulfillment, pickFile, run, approveProduct, setProductComment, setProductFulfillment, generateExcel, reset };
}
