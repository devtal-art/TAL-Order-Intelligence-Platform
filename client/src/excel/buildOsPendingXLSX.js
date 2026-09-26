// Builds the "OS Pending by Item" export workbook (new, additive), same
// XLSX.utils.aoa_to_sheet pattern as buildXLSX.js. Takes the CALLER's
// already filtered/sorted item list (OsPendingList.jsx's `visibleItems`) —
// so the export always matches exactly what's on screen, including the
// Search and Order Date filters, with no server round trip needed.
import * as XLSX from 'xlsx';

export function buildOsPendingXLSX(items) {
  const wb = XLSX.utils.book_new();

  const add = (aoa, name, cols) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // Sheet 1 — Summary: one row per item number, matching the on-screen table.
  add(
    [
      ['ITEM NO', 'PRODUCT', 'PENDING QTY', 'ORDERS'],
      ...items.map((it) => [it.itemNo, it.productName || '', it.totalPendingQty, it.orders.length]),
    ],
    'Summary',
    [12, 50, 14, 10]
  );

  // Sheet 2 — Detail: one row per order contributing to each item's total,
  // matching what the "View" modal shows for that item.
  const detailRows = [];
  for (const it of items) {
    for (const o of it.orders) {
      detailRows.push([it.itemNo, it.productName || '', o.portalOrderRef, o.customerName || '', o.pendingQty]);
    }
  }
  add(
    [['ITEM NO', 'PRODUCT', 'ORDER #', 'CUSTOMER', 'PENDING QTY'], ...detailRows],
    'Detail',
    [12, 50, 14, 40, 14]
  );

  return wb;
}
