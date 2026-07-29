import { useState, useCallback, useMemo } from 'react';
import { resolveService } from '../services/resolveService.js';
import { mappingService } from '../services/mappingService.js';
import { catalogService } from '../services/catalogService.js';
import { orderService } from '../services/orderService.js';
import { appendManualProduct } from '../utils/manualProduct.js';
import { portalOrderRef } from '../utils/order.js';
import {
  emptyAddress,
  emptyProductRow,
  emptyMasterTotalRow,
  buildOrderInfo,
  buildFinancialsFromMasterTotals,
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

  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [productRows, setProductRows] = useState([emptyProductRow()]);
  const [masterTotalRows, setMasterTotalRows] = useState([emptyMasterTotalRow()]);

  const [companySuggestions, setCompanySuggestions] = useState([]);

  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedRef, setSavedRef] = useState('');
  // Set when a save attempt finds an existing order with the same ref — the
  // caller must show a confirm UI and re-invoke save({ confirmDuplicate: true }).
  const [duplicate, setDuplicate] = useState(null); // { ref, existing } | null

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

  const grandTotal = useMemo(
    () => masterTotalRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [masterTotalRows]
  );

  // ── Build the parsed_data / resolution_data pair and save ──
  const buildAndSave = useCallback(
    async ({ confirmDuplicate = false } = {}) => {
      const realRows = productRows.filter((r) => !isProductRowEmpty(r));
      const err = validateManualOrderForm({ companyName, orderNumber, productRows: realRows });
      if (err) {
        setValidationError(err);
        return false;
      }
      setValidationError('');

      const billingAddr = { ...billing, company_name: companyName };
      const deliveryAddr = sameAsBilling ? billingAddr : { ...delivery, company_name: companyName };
      const order_info = buildOrderInfo({ orderNumber, orderDate, deliveryDate, referenceNumber, notes });

      const ref = portalOrderRef({ order_info }, '');

      if (!confirmDuplicate) {
        try {
          const existing = await orderService.get(ref);
          if (existing) {
            setDuplicate({ ref, existing });
            return false;
          }
        } catch {
          /* 404 = genuinely new order — proceed */
        }
      }
      setDuplicate(null);

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
        masterTotalRows.filter((r) => !isMasterTotalRowEmpty(r))
      );
      parsed = { ...parsed, financials };

      setSaving(true);
      setSaveError('');
      try {
        await orderService.save({
          portalOrderRef: ref,
          filename: '',
          customerName: companyName,
          orderDate,
          totalProducts: parsed.line_items.length,
          parsedData: parsed,
          resolutionData: resolution,
          orderSource: 'MANUAL',
        });
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
    [companyName, orderNumber, orderDate, deliveryDate, referenceNumber, notes, billing, delivery, sameAsBilling, productRows, masterTotalRows]
  );

  const cancelDuplicate = useCallback(() => setDuplicate(null), []);

  const reset = useCallback(() => {
    setCompanyName('');
    setBilling(emptyAddress());
    setDelivery(emptyAddress());
    setSameAsBilling(true);
    setOrderNumber('');
    setOrderDate('');
    setDeliveryDate('');
    setReferenceNumber('');
    setNotes('');
    setProductRows([emptyProductRow()]);
    setMasterTotalRows([emptyMasterTotalRow()]);
    setCompanySuggestions([]);
    setValidationError('');
    setSaving(false);
    setSaveError('');
    setSaved(false);
    setSavedRef('');
    setDuplicate(null);
  }, []);

  return {
    companyName, setCompanyName,
    billing, updateBilling,
    sameAsBilling, setSameAsBilling,
    delivery, updateDelivery,
    orderNumber, setOrderNumber,
    orderDate, setOrderDate,
    deliveryDate, setDeliveryDate,
    referenceNumber, setReferenceNumber,
    notes, setNotes,
    productRows, addProductRow, removeProductRow, updateProductRow,
    masterTotalRows, addMasterTotalRow, removeMasterTotalRow, updateMasterTotalRow,
    grandTotal,
    companySuggestions, searchCompanies, pickCompanySuggestion,
    lookupProduct,
    validationError,
    saving, saveError, saved, savedRef,
    duplicate, cancelDuplicate,
    save: buildAndSave,
    reset,
  };
}
