import * as XLSX from 'xlsx';

// Customer List → Excel export (Customer Intelligence module only).
// Same `xlsx` library + aoa_to_sheet/writeFile convention as the module's
// Reports export (reportService.js). Exports exactly the rows the list shows
// for the current search + filters + sort — every page, not just the visible one.

// Whole calendar days since `iso` in local time — same rule as the list's
// "N days ago" column.
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((startOf(new Date()) - startOf(d)) / 86400000));
}

// Local calendar date as a real Excel date (no time / timezone drift).
function excelDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {object[]} rows      customers from GET /v1/customers?all=1
 * @param {object}   opts      { query, sortText, filterLines: string[], currencySymbol }
 */
export function downloadCustomerListExcel(rows, { query, sortText = '', filterLines = [], currencySymbol = '£' } = {}) {
  const now = new Date();
  const moneyFmt = `"${currencySymbol}"#,##0.00`;

  const criteria = [];
  if (query && query.trim()) criteria.push(`Search: "${query.trim()}"`);
  criteria.push(...filterLines);

  const header = [
    'Customer', 'Group', 'Postcode', 'Orders', 'Ordered Value', 'Invoiced', 'Lit Invoice Orders',
    'Avg Order Value', 'Last Ordered', 'Days Since Last Order', 'First Order',
  ];

  const aoa = [
    ['Customers'],
    [`Exported ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${pad(now.getHours())}:${pad(now.getMinutes())}`],
    [`Filters: ${criteria.length ? criteria.join(' · ') : 'None (all customers)'}`],
    [`Sorted by: ${sortText || 'Ordered value (highest)'} · ${rows.length} customer${rows.length === 1 ? '' : 's'}`],
    [],
    header,
    ...rows.map((c) => [
      c.customerName,
      c.group || '', // Customer group (Quality / Falcon / Sira …), blank if none
      c.postCode || '',
      c.orderCount,
      c.totalRevenue,
      // Blank (not 0) when no orders are marked Lit Invoice — matches the "—" on screen.
      c.invoicedOrderCount ? c.invoicedValue : '',
      c.invoicedOrderCount || 0,
      c.avgOrderValue,
      excelDate(c.lastOrderDate),
      daysSince(c.lastOrderDate) ?? '',
      excelDate(c.firstOrderDate),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Number / date formats on the data rows.
  const firstDataRow = 6; // 0-based: 5 header-info rows + column header row
  // Column indexes: 4 Ordered Value, 5 Invoiced, 7 Avg Order Value (money);
  // 8 Last Ordered, 10 First Order (dates).
  const formats = { 4: moneyFmt, 5: moneyFmt, 7: moneyFmt, 8: 'dd mmm yyyy', 10: 'dd mmm yyyy' };
  for (let r = firstDataRow; r < aoa.length; r += 1) {
    for (const [c, z] of Object.entries(formats)) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
      if (cell && cell.v !== '') cell.z = z;
    }
  }

  ws['!cols'] = [
    { wch: 42 }, { wch: 15 }, { wch: 12 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 17 }, { wch: 14 }, { wch: 21 }, { wch: 14 },
  ];
  const lastCol = header.length - 1;
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: lastCol } }));
  // Excel filter dropdowns on the table's header row.
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: firstDataRow - 1, c: 0 }, e: { r: Math.max(aoa.length - 1, firstDataRow - 1), c: lastCol } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const filtered = criteria.length ? '_filtered' : '';
  XLSX.writeFile(wb, `Customers${filtered}_${stamp}.xlsx`, { bookType: 'xlsx', cellDates: true });
}
