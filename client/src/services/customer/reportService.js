import * as XLSX from 'xlsx';
import { apiClient } from '../apiClient.js';

// Customer Reports API (Phase 2, new, independent). Read-only.
//   GET /api/v1/customer-reports/:type — one report's { title, columns, rows, summary }
export const reportService = {
  get: ({ type, customerName, dateFrom, dateTo, limit }) => {
    const params = new URLSearchParams();
    if (customerName) params.set('customerName', customerName);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (limit) params.set('limit', limit);
    const qs = params.toString();
    return apiClient.get(`/v1/customer-reports/${encodeURIComponent(type)}${qs ? `?${qs}` : ''}`);
  },
};

const safeFilename = (title) => title.replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '_') || 'report';

// CSV export — plain string building, no library needed. Values are quoted
// and internal quotes escaped per RFC 4180.
export function downloadReportCsv(report) {
  const { title, columns, rows } = report;
  const escapeCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => escapeCell(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(title)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Excel export — same XLSX.utils.aoa_to_sheet + XLSX.writeFile convention
// already used by the Order Processing export (excel/buildXLSX.js).
export function downloadReportExcel(report) {
  const { title, columns, rows } = report;
  const wb = XLSX.utils.book_new();
  const aoa = [[title], [''], columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map(() => ({ wch: 22 }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(columns.length - 1, 0) } }];
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${safeFilename(title)}.xlsx`, { bookType: 'xlsx', type: 'binary', cellStyles: true });
}
