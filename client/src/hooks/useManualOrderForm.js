import { useState, useCallback, useMemo, useEffect } from 'react';
import { resolveService } from '../services/resolveService.js';
import { mappingService } from '../services/mappingService.js';
import { catalogService } from '../services/catalogService.js';
import { orderService } from '../services/orderService.js';
import { appendManualProduct } from '../utils/manualProduct.js';
import { ORDER_STATUSES } from '../utils/order.js';
import {
  emptyAddress,
  emptyProductRow,
  emptyMasterTotalRow,
  buildOrderInfo,
  buildFinancialsFromMasterTotals,
  computeProductsSubtotal,
  isProductRowEmpty,
  isMasterTotalRowEmpty,
  validateManualOrderForm,
  normalizeUnitPrice,
} from '../utils/manualOrderBuilder.js';

// Orchestrates Manual Order Creation (V3.1 — new, additive) end to end:
// customer/address entry, unlimited product rows with smart lookup, unlimited
// Master Totals rows, and save. Reuses the SAME services/utilities the HTML
// upload flow uses (resolveService, mappingService, catalogService,
// orderService, appendManualProduct, portalOrderRef) so the saved Order is
// built from identical building blocks — never a parallel implementation.
export function useManualOrderForm() {
  const [companyName, setCompanyName] = useState('');
  const [billing, setBilling] = useState(emptyAddress());
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [delivery, setDelivery] = useState(emptyAddress());

  // Order Number (V5) — server-assigned 'KS-YYYYMMDD-N', never typed by the
  // user. orderNumberPreview is what's shown while the form is open; the
  // authoritative ref is whatever createManualOrder returns at save time
  // (see buildAndSave below) — refreshOrderNumberPreview just keeps the
  // on-screen preview reasonably current.
  const [orderNumberPreview, setOrderNumberPreview] = useState('');
  const [orderNumberLoading, setOrderNumberLoading] = useState(true);
  const [orderNumberError, setOrderNumberError] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [productRows, setProductRows] = useState([emptyProductRow()]);
  const [masterTotalRows, setMasterTotalRows] = useState([emptyMasterTotalRow()]);

  // Overall Order Status / Order Comment (V3.2) — required before save,
  // same rule as the HTML upload flow's Review screen.
  const [orderStatus, setOrderStatus] = useState('');
  const [orderComment, setOrderComment] = useState('');

  const [companySuggestions, setCompanySuggestions] = useState([]);

  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedRef, setSavedRef] = useState('');

  // Order Number preview (V5) — fetched fresh whenever the form is ready
  // for a new order (mount, and again after reset() for "Create Another").
  // Display-only (the real ref is assigned server-side at save time
  // regardless, see buildAndSave) — but a fetch failure surfaces as a
  // visible retryable error rather than silently leaving the field blank,
  // so a real problem (not logged in, server down, etc.) is never mistaken
  // for "it's just generating".
  const refreshOrderNumberPreview = useCallback(async () => {
    setOrderNumberLoading(true);
    setOrderNumberError('');
    try {
      const resp = await orderService.nextManualRef();
      const ref = resp?.nextRef || '';
      setOrderNumberPreview(ref);
      if (!ref) setOrderNumberError('Server did not return an order number.');
    } catch (e) {
      setOrderNumberPreview('');
      setOrderNumberError(e.message || 'Could not generate the order number.');
    } finally {
      setOrderNumberLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOrderNumberPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount only
  }, []);

  // ── Address / company ──
  const updateBilling = useCallback((patch) => setBilling((b) => ({ ...b, ...patch })), []);
  const updateDelivery = useCallback((patch) => setDelivery((d) => ({ ...d, ...patch })), []);

  const searchCompanies = useCallback(async (query) => {
    const q = query.trim();
    if (!q) {
      setCompanySuggestions([]);
      return;
    }
    try {
      const resp = await orderService.autocompleteCompanies(q);
      setCompanySuggestions(Array.isArray(resp) ? resp : resp?.data || []);
    } catch {
      setCompanySuggestions([]);
    }
  }, []);

  // Picking a suggested company prefills address from that company's most
  // recent saved order — reuses orderService.get, nothing new server-side.
  // Best-effort: a fetch failure just leaves the address fields as they were.
  const pickCompanySuggestion = useCallback(async (suggestion) => {
    setCompanyName(suggestion.companyName);
    setCompanySuggestions([]);
    if (!suggestion.latestOrderRef) return;
    try {
      const order = await orderService.get(suggestion.latestOrderRef);
      const b = order?.parsedData?.billing_address;
      const d = order?.parsedData?.delivery_address;
      if (b) updateBilling({ ...emptyAddress(), ...b, company_name: suggestion.companyName });
      if (d && JSON.stringify(d) !== JSON.stringify(b)) {
        setSameAsBilling(false);
        updateDelivery({ ...emptyAddress(), ...d });
      }
    } catch {
      /* best-effort prefill only */
    }
  }, [updateBilling, updateDelivery]);

  // ── Product rows ──
  const addProductRow = useCallback(() => setProductRows((rows) => [...rows, emptyProductRow()]), []);
  const removeProductRow = useCallback(
    (id) => setProductRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows)),
    []
  );
  const updateProductRow = useCallback(
    (id, patch) => setProductRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  // Shared smart lookup for a product row (Cases 1-4): Approved Mappings
  // first, Product Catalog fallback. Returns { mappings, catalogItems } so the
  // row component can render one combined dropdown. Never throws — a search
  // failure just yields no suggestions (never blocks manual typing).
  const lookupProduct = useCallback(async (query) => {
    const q = query.trim();
    if (!q) return { mappings: [], catalogItems: [] };
    let mappings = [];
    try {
      const resp = await mappingService.search(q, 8);
      mappings = resp?.data || [];
    } catch {
      mappings = [];
    }
    if (mappings.length) return { mappings, catalogItems: [] };
    let catalogItems = [];
    try {
      const resp = await catalogService.searchProducts(q, 8);
      catalogItems = resp?.data || [];
    } catch {
      catalogItems = [];
    }
    return { mappings: [], catalogItems };
  }, []);

  // ── Master Totals ──
  const addMasterTotalRow = useCallback(() => setMasterTotalRows((rows) => [...rows, emptyMasterTotalRow()]), []);
  const removeMasterTotalRow = useCallback(
    (id) => setMasterTotalRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows)),
    []
  );
  const updateMasterTotalRow = useCallback(
    (id, patch) => setMasterTotalRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  // Auto-computed sum of every product row's Total (qty × unit price) — the
  // Master Totals rows are now adjustments (discount, transportation, etc.)
  // on top of this, not a place to re-type it by hand.
  const productsSubtotal = useMemo(() => computeProductsSubtotal(productRows), [productRows]);

  const grandTotal = useMemo(
    () => productsSubtotal + masterTotalRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [productsSubtotal, masterTotalRows]
  );

  // ── Build the parsed_data / resolution_data pair and save ──
  const buildAndSave = useCallback(
    async () => {
      const realRows = productRows.filter((r) => !isProductRowEmpty(r));
      const err = validateManualOrderForm({ companyName, productRows: realRows });
      if (err) {
        setValidationError(err);
        return false;
      }
      if (!ORDER_STATUSES.includes(orderStatus)) {
        setValidationError('Order Status must be selected before saving.');
        return false;
      }
      setValidationError('');

      const billingAddr = { ...billing, company_name: companyName };
      const deliveryAddr = sameAsBilling ? billingAddr : { ...delivery, company_name: companyName };
      // orderNumberPreview here is display-only (the informational
      // parsed_data.order_info.order_ref sub-field) — the real, authoritative
      // portal_order_ref is whatever createManualOrder assigns below, never
      // this value. No duplicate-ref check is needed anymore: the server
      // guarantees a unique number at save time (see orderService.js
      // createManualOrder, race-safe against concurrent saves).
      const order_info = buildOrderInfo({ orderNumber: orderNumberPreview, orderDate, deliveryDate, referenceNumber, notes });

      // Build line_items + resolution results in the SAME order the rows are
      // displayed. Rows with a confirmed itemNo go through appendManualProduct
      // — the exact function the existing "+ Add Product" feature uses, so
      // they land in the Order exactly as an already-approved manual addition
      // would. Rows with only a typed name (no confirmed catalog item) get a
      // placeholder result that is immediately replaced by a real
      // resolveService.resolve() call below — the same matching pipeline the
      // HTML upload flow runs.
      let parsed = { order_info, billing_address: billingAddr, delivery_address: deliveryAddr, line_items: [] };
      let resolution = { catalogVersion: null, results: [] };
      const pendingResolve = []; // { lineId, name }

      realRows.forEach((row, i) => {
        const lineId = String(i + 1);
        if (String(row.itemNo || '').trim()) {
          const appended = appendManualProduct(parsed, resolution, {
            websiteProductName: row.websiteProductName || row.itemNo,
            itemNo: row.itemNo,
            emailProductName: row.emailProductName || row.websiteProductName || row.itemNo,
            qty: row.qty,
            unitPrice: row.unitPrice,
          });
          parsed = appended.parsed;
          resolution = appended.resolution;
        } else {
          const name = row.emailProductName || row.websiteProductName;
          const q = Number(row.qty) || 0;
          const unit = normalizeUnitPrice(row.unitPrice);
          parsed = {
            ...parsed,
            line_items: [
              ...parsed.line_items,
              { product_code: 'N.A', description: name, package: 'N/A', qty: q, unit_price: unit, total: Math.round(unit * q * 100) / 100 },
            ],
          };
          resolution = {
            ...resolution,
            results: [
              ...resolution.results,
              { lineId, emailProductName: name, status: 'needs_review', confidence: null, reason: 'Pending resolution.', source: null, match: null, suggestedProduct: null, candidates: [] },
            ],
          };
          pendingResolve.push({ lineId, name });
        }
      });

      if (pendingResolve.length) {
        try {
          const resolved = await resolveService.resolve(pendingResolve);
          const byId = new Map(resolved.results.map((r) => [r.lineId, r]));
          resolution = {
            ...resolution,
            catalogVersion: resolved.catalogVersion,
            results: resolution.results.map((r) => byId.get(r.lineId) || r),
          };
        } catch (e) {
          // A catalog/resolve failure must not block saving the order — the
          // rows simply keep their "needs_review, pending" placeholder and can
          // be resolved later like any other needs-review product.
          console.warn('Product resolution failed during manual order save:', e.message);
        }
      }

      const financials = buildFinancialsFromMasterTotals(
        masterTotalRows.filter((r) => !isMasterTotalRowEmpty(r)),
        productsSubtotal
      );
      parsed = { ...parsed, financials };

      setSaving(true);
      setSaveError('');
      try {
        const created = await orderService.createManualOrder({
          customerName: companyName,
          orderDate,
          totalProducts: parsed.line_items.length,
          parsedData: parsed,
          resolutionData: resolution,
        });
        // The server-assigned ref — never orderNumberPreview — is the real
        // identifier for every follow-up call and for what's shown after save.
        const ref = created.portalOrderRef;
        await orderService.setOrderStatus(ref, { orderStatus, orderComment });
        // Delivery Date (V4.2) now lives in its own top-level, directly-
        // editable field — flushed best-effort here too (mirrors the HTML
        // upload Review flow) so it survives future re-edits via Saved Order
        // Lookup instead of only living inside the parsed_data snapshot that
        // upsertOrder above fully replaces.
        if (deliveryDate) {
          orderService.setDeliveryDate(ref, deliveryDate).catch((e) => console.warn('Delivery date flush failed:', e.message));
        }
        // Per-product Item Status / Reason / Notes — same optional
        // delivery-tracking fields the Saved Order edit view offers, flushed
        // best-effort like Delivery Date above so a hiccup here never blocks
        // "order saved". lineId matches realRows' position (String(i + 1)),
        // the same contract appendManualProduct used when building line_items.
        const fulfillmentPayload = {};
        const commentsPayload = {};
        const notesPayload = {};
        realRows.forEach((row, i) => {
          const lineId = String(i + 1);
          if (row.status) fulfillmentPayload[lineId] = { status: row.status };
          if (row.comment) commentsPayload[lineId] = row.comment;
          if (String(row.notes || '').trim()) notesPayload[lineId] = row.notes.trim();
        });
        if (Object.keys(fulfillmentPayload).length) {
          orderService.setFulfillment(ref, fulfillmentPayload).catch((e) => console.warn('Product fulfillment flush failed:', e.message));
        }
        if (Object.keys(commentsPayload).length) {
          orderService.setComments(ref, commentsPayload).catch((e) => console.warn('Product comment flush failed:', e.message));
        }
        if (Object.keys(notesPayload).length) {
          orderService.setNotes(ref, notesPayload).catch((e) => console.warn('Product note flush failed:', e.message));
        }
        setSaved(true);
        setSavedRef(ref);
        return true;
      } catch (e) {
        setSaveError(e.message || 'Could not save the order. Please try again.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [companyName, orderNumberPreview, orderDate, deliveryDate, referenceNumber, notes, billing, delivery, sameAsBilling, productRows, masterTotalRows, orderStatus, orderComment, productsSubtotal]
  );

  const reset = useCallback(() => {
    setCompanyName('');
    setBilling(emptyAddress());
    setDelivery(emptyAddress());
    setSameAsBilling(true);
    setOrderDate('');
    setDeliveryDate('');
    setReferenceNumber('');
    setNotes('');
    setProductRows([emptyProductRow()]);
    setMasterTotalRows([emptyMasterTotalRow()]);
    setOrderStatus('');
    setOrderComment('');
    setCompanySuggestions([]);
    setValidationError('');
    setSaving(false);
    setSaveError('');
    setSaved(false);
    setSavedRef('');
    refreshOrderNumberPreview();
  }, [refreshOrderNumberPreview]);

  return {
    companyName, setCompanyName,
    billing, updateBilling,
    sameAsBilling, setSameAsBilling,
    delivery, updateDelivery,
    orderNumberPreview, orderNumberLoading, orderNumberError, refreshOrderNumberPreview,
    orderDate, setOrderDate,
    deliveryDate, setDeliveryDate,
    referenceNumber, setReferenceNumber,
    notes, setNotes,
    productRows, addProductRow, removeProductRow, updateProductRow,
    masterTotalRows, addMasterTotalRow, removeMasterTotalRow, updateMasterTotalRow,
    orderStatus, setOrderStatus, orderComment, setOrderComment,
    productsSubtotal, grandTotal,
    companySuggestions, searchCompanies, pickCompanySuggestion,
    lookupProduct,
    validationError,
    saving, saveError, saved, savedRef,
    save: buildAndSave,
    reset,
  };
}
