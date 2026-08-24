// Builds the "Export Dashboard" workbook (V4.8, read-only) from the raw
// order docs returned by orderService.getDashboardExportOrders(). Every
// sheet is derived purely from that dataset — nothing here queries the DB
// or writes anything.
import ExcelJS from 'exceljs';
import { PROCESSED_BY_USERS, DELIVERY_STATUSES, PRODUCT_COMMENTS, ORDER_STATUSES, DISCOUNT_BUCKETS } from '../services/orderService.js';

// Mirrors client/src/utils/order.js's deliveryMeta/discountBucketMeta labels
// exactly, so the workbook reads identically to what's on screen.
const ITEM_STATUS_LABELS = { delivered: 'Released', half_delivered: 'Half Released', not_delivered: 'Not Released' };
const DISCOUNT_LABELS = {
  sales_rep: 'Sales Rep Special Discount',
  rdd: 'RDD - Range Density Discount',
  both: 'Both or Combined Discounts',
  other: 'Other Discount',
};

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

function styleSheet(ws) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addOrderListSheet(wb, title, orders) {
  const ws = wb.addWorksheet(title);
  ws.columns = [
    { header: 'Order #', key: 'ref', width: 16 },
    { header: 'Customer', key: 'customer', width: 40 },
    { header: 'Channel', key: 'channel', width: 16 },
    { header: 'Order Status', key: 'status', width: 22 },
    { header: 'Processed By', key: 'processedBy', width: 16 },
    { header: 'Order Date', key: 'orderDate', width: 14 },
    { header: 'Delivery Date', key: 'deliveryDate', width: 14 },
    { header: 'Products', key: 'products', width: 10 },
    { header: 'Order Comment', key: 'comment', width: 44 },
  ];
  for (const o of orders) {
    ws.addRow({
      ref: o.portal_order_ref,
      customer: o.customer_name || '',
      channel: o.order_channel || '',
      status: o.order_status || '',
      processedBy: o.processed_by || '',
      orderDate: o.order_date || '',
      deliveryDate: o.delivery_date || '',
      products: o.total_products || 0,
      comment: o.order_comment || '',
    });
  }
  styleSheet(ws);
  return ws;
}

export function buildDashboardWorkbook(orders) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Order Intelligence Platform';
  wb.created = new Date();

  const emailOrders = orders.filter((o) => o.order_channel === 'Orders - Email');
  const kumkumOrders = orders.filter((o) => o.order_channel === 'Order - Kumkum');

  // Single pass over every order's line items — feeds All Items, Unique
  // Items, Item Status, Reason, and the Discount sheet's order list.
  const itemStatusCounts = { delivered: 0, half_delivered: 0, not_delivered: 0 };
  const reasonCounts = { OS: 0, 'Not Found': 0 };
  const orderStatusCounts = {};
  for (const s of ORDER_STATUSES) orderStatusCounts[s] = 0;
  const discountCounts = {};
  for (const d of DISCOUNT_BUCKETS) discountCounts[d] = 0;
  const processorCounts = {};
  for (const p of PROCESSED_BY_USERS) processorCounts[p] = 0;

  const allItemsRows = [];
  const discountOrderRows = [];
  const uniqueItemMap = new Map(); // itemNo -> { itemNo, websiteName, orderRefs:Set, totalQty }
  let totalItems = 0;

  for (const o of orders) {
    if (o.order_status && orderStatusCounts[o.order_status] !== undefined) orderStatusCounts[o.order_status]++;
    if (o.discount_bucket && discountCounts[o.discount_bucket] !== undefined) {
      discountCounts[o.discount_bucket]++;
      discountOrderRows.push({
        ref: o.portal_order_ref,
        customer: o.customer_name || '',
        orderDate: o.order_date || '',
        discountType: DISCOUNT_LABELS[o.discount_bucket] || o.discount_bucket,
      });
    }
    if (o.processed_by && processorCounts[o.processed_by] !== undefined) processorCounts[o.processed_by]++;

    // Item Status / Reason totals: a raw pass over the stored maps
    // themselves (matching getDashboardSummary's own mapEntries-based
    // counting), NOT gated by whether the lineId still matches a current
    // resolution result. A line can be manually removed/renumbered after
    // its comment/fulfillment entry was set — product_comments/
    // product_fulfillment are siblings of resolution_data specifically so
    // re-saves don't wipe them, so a handful of orders carry a stale entry
    // for a lineId that no longer has a matching product. The dashboard
    // still counts those; this sheet does too, so the two numbers always
    // agree instead of the export quietly under-reporting by a few.
    for (const val of Object.values(o.product_fulfillment || {})) {
      if (val?.status && itemStatusCounts[val.status] !== undefined) itemStatusCounts[val.status]++;
    }
    for (const val of Object.values(o.product_comments || {})) {
      if (val && reasonCounts[val] !== undefined) reasonCounts[val]++;
    }

    // resolution_data.results carries the AUTHORITATIVE lineId for each
    // product — String(index+1) for a single upload, but "<orderIdx>-
    // <index+1>" for anything originally uploaded via batch mode (the email
    // line index is always the last hyphen-separated segment). product_
    // comments/product_fulfillment are keyed by that same real lineId, NOT
    // a plain 1-based index — using a naive index+1 here silently misses
    // every batch order's fulfillment/comment data (caught via a dashboard
    // vs. export count mismatch during testing). Mirrors the exact lookup
    // SavedOrderLookup.jsx's `rows` computation already uses.
    const items = o.line_items || [];
    const results = o.resolution_results?.length ? o.resolution_results : items.map((_, i) => ({ lineId: String(i + 1) }));
    totalItems += results.length;
    results.forEach((r, displayIdx) => {
      const lineId = String(r.lineId);
      const lineIndex = Number(lineId.split('-').pop()) - 1;
      const item = Number.isInteger(lineIndex) && lineIndex >= 0 ? items[lineIndex] : null;
      const fulfillment = o.product_fulfillment?.[lineId] || {};
      const reason = o.product_comments?.[lineId] || '';
      const note = o.product_notes?.[lineId] || '';
      // Item No / Website Product columns show the suggested match for a
      // still-unapproved line too — same fallback OrderReviewGroup.jsx uses
      // (`approved ? r.match : r.suggestedProduct`) for these exact columns.
      const itemNo = r.match?.itemNo || r.suggestedProduct?.itemNo || '';
      const websiteName = r.match?.websiteProductName || r.suggestedProduct?.websiteProductName || '';
      // "Unique Items" only counts CONFIRMED matches (r.match, not a mere
      // suggestion) — mirrors getDashboardSummary's unique_items facet
      // exactly (it only ever reads r.match.itemNo), so the two numbers
      // agree.
      const confirmedItemNo = r.match?.itemNo || '';
      // (Item Status / Reason are already tallied above from the raw maps —
      // not repeated here, to avoid double-counting the common case where a
      // lineId matches both a stored entry and a current resolution result.)

      allItemsRows.push({
        ref: o.portal_order_ref,
        customer: o.customer_name || '',
        line: displayIdx + 1,
        product: item ? item.description : r.emailProductName || '',
        itemNo,
        websiteName,
        qty: item ? item.qty ?? '' : '',
        unitPrice: item ? item.unit_price ?? '' : '',
        total: item ? item.total ?? '' : '',
        itemStatus: fulfillment.status ? ITEM_STATUS_LABELS[fulfillment.status] || fulfillment.status : '',
        reason,
        comments: note,
      });

      if (confirmedItemNo) {
        if (!uniqueItemMap.has(confirmedItemNo)) {
          uniqueItemMap.set(confirmedItemNo, { itemNo: confirmedItemNo, websiteName, orderRefs: new Set(), totalQty: 0 });
        }
        const u = uniqueItemMap.get(confirmedItemNo);
        u.orderRefs.add(o.portal_order_ref);
        u.totalQty += Number(item?.qty) || 0;
      }
    });
  }

  // ── Summary — overview numbers, mirrors every stat card on the dashboard ──
  const summaryWs = wb.addWorksheet('Summary');
  summaryWs.columns = [
    { header: 'Metric', key: 'metric', width: 36 },
    { header: 'Value', key: 'value', width: 22 },
  ];
  const addSummaryRow = (metric, value) => summaryWs.addRow({ metric, value });
  addSummaryRow('Total Orders', orders.length);
  addSummaryRow('Orders - Email', emailOrders.length);
  addSummaryRow('Orders - Kumkum', kumkumOrders.length);
  addSummaryRow('Total Items', totalItems);
  addSummaryRow('Unique Items', uniqueItemMap.size);
  summaryWs.addRow({});
  for (const s of ORDER_STATUSES) addSummaryRow(`Order Status — ${s}`, orderStatusCounts[s]);
  summaryWs.addRow({});
  for (const s of DELIVERY_STATUSES) addSummaryRow(`Item Status — ${ITEM_STATUS_LABELS[s]}`, itemStatusCounts[s]);
  summaryWs.addRow({});
  for (const c of PRODUCT_COMMENTS) addSummaryRow(`Reason — ${c}`, reasonCounts[c] || 0);
  summaryWs.addRow({});
  for (const d of DISCOUNT_BUCKETS) addSummaryRow(`Discount — ${DISCOUNT_LABELS[d]}`, discountCounts[d]);
  summaryWs.addRow({});
  addSummaryRow('Exported At', new Date().toLocaleString('en-GB'));
  styleSheet(summaryWs);

  // ── All Orders / Orders - Email / Orders - Kumkum ──
  addOrderListSheet(wb, 'All Orders', orders);
  addOrderListSheet(wb, 'Orders - Email', emailOrders);
  addOrderListSheet(wb, 'Orders - Kumkum', kumkumOrders);

  // ── All Items — one row per line item across every order ──
  const itemsWs = wb.addWorksheet('All Items');
  itemsWs.columns = [
    { header: 'Order #', key: 'ref', width: 16 },
    { header: 'Customer', key: 'customer', width: 34 },
    { header: 'Line #', key: 'line', width: 8 },
    { header: 'Product (Email)', key: 'product', width: 44 },
    { header: 'Item No', key: 'itemNo', width: 12 },
    { header: 'Website Product', key: 'websiteName', width: 44 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Unit Price', key: 'unitPrice', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Item Status', key: 'itemStatus', width: 16 },
    { header: 'Reason', key: 'reason', width: 12 },
    { header: 'Comments', key: 'comments', width: 34 },
  ];
  for (const row of allItemsRows) itemsWs.addRow(row);
  styleSheet(itemsWs);

  // ── Unique Items — distinct matched item numbers across all orders ──
  const uniqueWs = wb.addWorksheet('Unique Items');
  uniqueWs.columns = [
    { header: 'Item No', key: 'itemNo', width: 12 },
    { header: 'Website Product', key: 'websiteName', width: 50 },
    { header: 'Orders Count', key: 'orderCount', width: 14 },
    { header: 'Total Qty Ordered', key: 'totalQty', width: 16 },
  ];
  const uniqueRows = [...uniqueItemMap.values()]
    .map((u) => ({ itemNo: u.itemNo, websiteName: u.websiteName, orderCount: u.orderRefs.size, totalQty: u.totalQty }))
    .sort((a, b) => b.orderCount - a.orderCount);
  for (const row of uniqueRows) uniqueWs.addRow(row);
  styleSheet(uniqueWs);

  // ── Order Status — counts, matches the 4 dashboard stat cards ──
  const statusWs = wb.addWorksheet('Order Status');
  statusWs.columns = [
    { header: 'Order Status', key: 'status', width: 26 },
    { header: 'Count', key: 'count', width: 10 },
    { header: '% of Total', key: 'pct', width: 12 },
  ];
  for (const s of ORDER_STATUSES) {
    statusWs.addRow({
      status: s,
      count: orderStatusCounts[s],
      pct: orders.length ? `${Math.round((orderStatusCounts[s] / orders.length) * 1000) / 10}%` : '0%',
    });
  }
  styleSheet(statusWs);

  // ── Item Status (+ Reason) — matches the dashboard's Item card ──
  const itemStatusWs = wb.addWorksheet('Item Status');
  itemStatusWs.columns = [
    { header: 'Item Status', key: 'label', width: 26 },
    { header: 'Count', key: 'count', width: 10 },
  ];
  for (const s of DELIVERY_STATUSES) itemStatusWs.addRow({ label: ITEM_STATUS_LABELS[s], count: itemStatusCounts[s] });
  itemStatusWs.addRow({});
  itemStatusWs.addRow({ label: 'Reason', count: '' });
  for (const c of PRODUCT_COMMENTS) itemStatusWs.addRow({ label: c, count: reasonCounts[c] || 0 });
  styleSheet(itemStatusWs);

  // ── Discount — one row per order that has a discount bucket assigned ──
  const discountWs = wb.addWorksheet('Discount');
  discountWs.columns = [
    { header: 'Order #', key: 'ref', width: 16 },
    { header: 'Customer', key: 'customer', width: 38 },
    { header: 'Order Date', key: 'orderDate', width: 14 },
    { header: 'Discount Type', key: 'discountType', width: 30 },
  ];
  for (const row of discountOrderRows) discountWs.addRow(row);
  styleSheet(discountWs);

  // ── Team Performance — matches the dashboard's Team Performance table ──
  const teamWs = wb.addWorksheet('Team Performance');
  teamWs.columns = [
    { header: 'Employee', key: 'employee', width: 20 },
    { header: 'Orders Processed', key: 'count', width: 18 },
  ];
  for (const p of PROCESSED_BY_USERS) teamWs.addRow({ employee: p, count: processorCounts[p] });
  styleSheet(teamWs);

  return wb;
}
