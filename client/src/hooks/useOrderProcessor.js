import { useState, useCallback, useRef } from 'react';
import { parseOrderHTML } from '../parser/parseOrderHTML.js';
import { buildXLSX } from '../excel/buildXLSX.js';
import { resolveService } from '../services/resolveService.js';
import { mappingService } from '../services/mappingService.js';
import { orderService } from '../services/orderService.js';
import { portalOrderRef } from '../utils/order.js';
import { appendManualProduct, removeManualProduct, remapAfterRemoval } from '../utils/manualProduct.js';
import { sleep } from '../utils/timing.js';

// Orchestrates the flow: upload → parse → resolve → review → (generate) Excel.
// The parser and Excel builder are used unchanged; resolution is inserted
// between parsing and Excel generation.
export function useOrderProcessor() {
  const [screen, setScreen] = useState('upload'); // 'upload' | 'proc' | 'duplicate' | 'review' | 'results' | 'error'
  const [file, setFile] = useState(null);
  const [steps, setSteps] = useState(['', '', '']); // '' | 'run' | 'done'
  const [parsed, setParsed] = useState(null); // parseOrderHTML output
  const [resolution, setResolution] = useState(null); // resolve API response
  const [result, setResult] = useState(null); // { data, workbook }
  const [error, setError] = useState('');
  const [comments, setComments] = useState({}); // { [lineId]: 'Released' | 'OS' | 'N/A' } (V1.3)
  const [fulfillment, setFulfillment] = useState({}); // { [lineId]: { pendingQty, status } } (V1.4)
  const [notes, setNotes] = useState({}); // { [lineId]: string } — free-text Additional Comments (V1.7)
  const [pending, setPending] = useState(null); // duplicate upload awaiting a decision: { data, resolved, prev, ref }
  const [saved, setSaved] = useState(false); // true once the order has been explicitly saved to the DB (V2.0)
  const orderRefRef = useRef(null); // Portal Order Ref of the PERSISTED order (set only after the first save)
  const plannedRefRef = useRef(null); // Portal Order Ref of the order being reviewed (before its first save)

  const setStepStatus = (i, status) =>
    setSteps((prev) => {
      const next = [...prev];
      next[i] = status;
      return next;
    });

  const pickFile = useCallback((f) => setFile(f), []);

  // Explicitly persist the order being reviewed to MongoDB (V2.0). This is
  // the ONLY function that writes the order for the first time — it is called
  // exclusively when the user clicks the "Save Order" button on the Review
  // screen. An order is NEVER written to the DB before that deliberate action.
  //
  // processedBy is NO LONGER sent from the client (V3.0 — JWT Auth). The
  // server automatically assigns req.user.name from the verified JWT token.
  // After the initial save, any per-product edits made while the order was
  // still unsaved (comments / fulfillment / notes) are flushed as best-effort
  // PATCH calls.
  const saveOrder = useCallback(async () => {
    const ref = plannedRefRef.current;
    if (!ref || !parsed || !resolution) return;
    orderRefRef.current = ref;
    try {
      await orderService.save({
        portalOrderRef: ref,
        filename: file?.name || '',
        customerName: parsed.billing_address?.company_name || '',
        orderDate: parsed.order_info?.order_date || '',
        totalProducts: (parsed.line_items || []).length,
        parsedData: parsed,
        resolutionData: resolution,
        // processedBy is intentionally omitted — the server sets it from req.user.name.
      });
      setSaved(true);
      // Flush per-product edits made before the save (best-effort — a DB
      // failure must NOT block the review → Excel flow).
      if (Object.keys(comments).length) {
        orderService.setComments(ref, comments).catch((e) => console.warn('Order comment flush failed:', e.message));
      }
      if (Object.keys(fulfillment).length) {
        const payload = {};
        for (const [lineId, f] of Object.entries(fulfillment)) {
          payload[lineId] = {
            pendingQty: f?.pendingQty === '' || f?.pendingQty === undefined ? null : Number(f.pendingQty),
            status: f?.status || null,
          };
        }
        orderService.setFulfillment(ref, payload).catch((e) => console.warn('Order fulfillment flush failed:', e.message));
      }
      if (Object.keys(notes).length) {
        const payload = {};
        for (const [lineId, v] of Object.entries(notes)) payload[lineId] = v ? v.trim() : null;
        orderService.setNotes(ref, payload).catch((e) => console.warn('Order notes flush failed:', e.message));
      }
    } catch (e) {
      console.warn('Order save failed:', e.message);
    }
  }, [file, parsed, resolution, comments, fulfillment, notes]);

  // Show the Review screen for a parsed + resolved order (V2.0). Carries over
  // manual lines from the previously saved order (`prev`, re-upload path).
  // Does NOT auto-save under any circumstance — the user must click "Save
  // Order" to commit the order to the DB. A re-upload that previously had a
  // Processed By will pre-populate the dropdown but still requires an explicit
  // save click.
  const finalizeReview = useCallback(
    (data, resolved, prev, ref) => {
      // V1.8: re-uploading an order's HTML must not silently drop products
      // that were manually added to the previously saved order — they exist
      // only in the stored snapshot, not in the email. Carry them over by
      // re-appending them (same product/qty/price, fresh lineIds after the
      // new HTML lines).
      let mergedData = data;
      let mergedResolved = resolved;
      const prevItems = prev?.parsedData?.line_items || [];
      for (const r of prev?.resolutionData?.results || []) {
        if (r?.source !== 'manual_addition' || !r.match?.itemNo) continue;
        const item = prevItems[Number(r.lineId) - 1];
        if (!item) continue;
        const appended = appendManualProduct(mergedData, mergedResolved, {
          websiteProductName: r.match.websiteProductName,
          itemNo: r.match.itemNo,
          emailProductName: r.emailProductName || item.description,
          qty: item.qty,
          unitPrice: item.unit_price,
        });
        mergedData = appended.parsed;
        mergedResolved = appended.resolution;
      }

      setParsed(mergedData);
      setResolution(mergedResolved);
      plannedRefRef.current = ref;

      // processedBy is no longer pre-populated (V3.0 — JWT Auth).
      // The authenticated user is automatically assigned at save time.

      setScreen('review');
    },
    [] // no external deps — refs and setters are stable
  );

  const run = useCallback(async () => {
    if (!file) return;
    setScreen('proc');
    setSteps(['', '', '']);
    setComments({});
    setFulfillment({});
    setNotes({});
    setSaved(false); // reset saved flag for the new upload (V2.0)
    setPending(null);
    orderRefRef.current = null;
    plannedRefRef.current = null;
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

      // V1.9: duplicate order detection. When this Portal Order Ref is
      // already saved, nothing is persisted yet — show the duplicate screen
      // (existing order's details + Open / Update / Cancel) and let the user
      // decide. A fetch failure (or 404 = genuinely new order) proceeds as a
      // fresh order, exactly like before.
      const ref = portalOrderRef(data, file.name);
      let prev = null;
      try {
        prev = await orderService.get(ref);
      } catch {
        /* no previously saved order */
      }

      if (prev) {
        setPending({ data, resolved, prev, ref });
        setScreen('duplicate');
        return;
      }

      finalizeReview(data, resolved, null, ref);
    } catch (e) {
      setError(e.message || String(e));
      setScreen('error');
    }
  }, [file, finalizeReview]);

  // Duplicate screen actions (V1.9). "Update" continues into the normal
  // review flow (with the manual-line carry-over and the previous order's
  // Processed By); the modal's edits flow back via updateDuplicateOrder so a
  // subsequent Update uses fresh data. Cancel is handled by reset().
  const continueDuplicate = useCallback(() => {
    if (!pending) return;
    const { data, resolved, prev, ref } = pending;
    setPending(null);
    finalizeReview(data, resolved, prev, ref);
  }, [pending, finalizeReview]);

  const updateDuplicateOrder = useCallback((updated) => {
    setPending((p) => (p ? { ...p, prev: updated } : p));
  }, []);

  // Set (or clear, with '') the team member who processed this order.
  // V3.0 (JWT Auth): This callback is retained for compatibility but is no
  // longer called from any UI — processedBy is now automatically set server-side.
  const chooseProcessedBy = useCallback((value) => {
    // No-op — processedBy is managed server-side via req.user.name.
    void value;
  }, []);

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

  // Manually add one catalog product to the order on the Review screen (V1.6).
  // Appends the line to the parsed snapshot and an already-approved result
  // (catalog product → Approved, 100%) to the resolution snapshot, then
  // re-persists the order through the same upsert the initial save uses.
  // Comments/fulfillment live as siblings of the snapshots, so they survive.
  const addProduct = useCallback(
    async (input) => {
      const appended = appendManualProduct(parsed, resolution, input);
      setParsed(appended.parsed);
      setResolution(appended.resolution);

      // Best-effort persist, like the initial save: a DB/API failure must not
      // block the review → Excel flow.
      if (orderRefRef.current) {
        orderService
          .save({
            portalOrderRef: orderRefRef.current,
            filename: file?.name || '',
            customerName: appended.parsed.billing_address?.company_name || '',
            orderDate: appended.parsed.order_info?.order_date || '',
            totalProducts: appended.parsed.line_items.length,
            parsedData: appended.parsed,
            resolutionData: appended.resolution,
          })
          .catch((e) => console.warn('Order persist failed:', e.message));
      }
    },
    [parsed, resolution, file]
  );

  // Remove one MANUALLY ADDED product from the order on the Review screen
  // (V1.7). HTML-parsed lines are untouched — removeManualProduct refuses
  // anything whose result is not source 'manual_addition'. Later manual lines
  // are renumbered, so the lineId-keyed maps (comments/fulfillment/notes) are
  // remapped locally and mirrored to the persisted order (best-effort, and
  // sequenced AFTER the snapshot save so server-side fulfillment validation
  // reads the updated line items).
  const removeProduct = useCallback(
    (lineId) => {
      const removed = removeManualProduct(parsed, resolution, lineId);
      if (!removed) return;

      const cm = remapAfterRemoval(comments, lineId, removed.remap);
      const fl = remapAfterRemoval(fulfillment, lineId, removed.remap, ['pendingQty', 'status']);
      const nt = remapAfterRemoval(notes, lineId, removed.remap);

      setParsed(removed.parsed);
      setResolution(removed.resolution);
      setComments(cm.next);
      setFulfillment(fl.next);
      setNotes(nt.next);

      if (orderRefRef.current) {
        const ref = orderRefRef.current;
        orderService
          .save({
            portalOrderRef: ref,
            filename: file?.name || '',
            customerName: removed.parsed.billing_address?.company_name || '',
            orderDate: removed.parsed.order_info?.order_date || '',
            totalProducts: removed.parsed.line_items.length,
            parsedData: removed.parsed,
            resolutionData: removed.resolution,
          })
          .then(() => {
            if (Object.keys(cm.patch).length) orderService.setComments(ref, cm.patch).catch((e) => console.warn('Order comment update failed:', e.message));
            if (Object.keys(fl.patch).length) orderService.setFulfillment(ref, fl.patch).catch((e) => console.warn('Order fulfillment update failed:', e.message));
            if (Object.keys(nt.patch).length) orderService.setNotes(ref, nt.patch).catch((e) => console.warn('Order note update failed:', e.message));
          })
          .catch((e) => console.warn('Order persist failed:', e.message));
      }
    },
    [parsed, resolution, comments, fulfillment, notes, file]
  );

  // Set (or clear, with '') one product's free-text Additional Comment (V1.7).
  // `persist: false` updates only local state (used while typing); the blur
  // handler persists with the default true. Mirrors to the persisted Order
  // best-effort, like comments — the two fields are fully independent.
  const setProductNote = useCallback((lineId, value, persist = true) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (value) next[lineId] = value;
      else delete next[lineId];
      return next;
    });
    if (persist && orderRefRef.current) {
      orderService
        .setNotes(orderRefRef.current, { [lineId]: value ? value.trim() : null })
        .catch((e) => console.warn('Order note update failed:', e.message));
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
    const workbook = buildXLSX(parsed, resolution, comments);
    setResult({ data: parsed, workbook });
    setScreen('results');
  }, [parsed, resolution, comments]);

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setResolution(null);
    setResult(null);
    setError('');
    setComments({});
    setFulfillment({});
    setNotes({});
    setSaved(false); // V2.0
    setPending(null);
    orderRefRef.current = null;
    plannedRefRef.current = null;
    setSteps(['', '', '']);
    setScreen('upload');
  }, []);

  return { screen, file, steps, parsed, resolution, result, error, comments, fulfillment, notes, saved, pending, pickFile, run, approveProduct, addProduct, removeProduct, setProductComment, setProductFulfillment, setProductNote, chooseProcessedBy, saveOrder, continueDuplicate, updateDuplicateOrder, generateExcel, reset };
}
