import * as XLSX from 'xlsx';

// Analytics Dashboard → Excel workbook. Exports exactly what the dashboard is
// showing for the active filters (the `overview` response already on the
// page — no extra request). Same XLSX.utils.aoa_to_sheet + XLSX.writeFile
// convention as the Reports export (reportService.js).
//
// `tiles` = [{ label, value, caption }] as rendered on the page (raw numbers),
// `filterLines` = human-readable active filters, e.g. ['Order Date: … → …'].
export function downloadAnalyticsWorkbook({ overview, tiles, filterLines, monthLabel }) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  const addSheet = (name, aoa, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // 1. Summary — filters + the 10 tiles.
  addSheet(
    'Summary',
    [
      ['Analytics Dashboard'],
      [`Exported ${now.toLocaleString('en-GB')}`],
      [''],
      ['Filters'],
      ...(filterLines.length ? filterLines.map((l) => [l]) : [['None (all orders)']]),
      [''],
      ['Metric', 'Value', 'How it is calculated'],
      ...tiles.map((t) => [t.label, t.value, t.caption]),
    ],
    [28, 18, 80]
  );

  // 2. Monthly trend — ordered / invoiced / orders / new customers.
  const ordersByMonth = new Map(overview.charts.monthlyOrders.map((m) => [m.month, m.orders]));
  const newByMonth = new Map(overview.charts.customerGrowth.map((m) => [m.month, m.newCustomers]));
  addSheet(
    'Monthly Trend',
    [
      ['Month', 'Ordered Value (£)', 'Invoiced (£)', 'Orders', 'New Customers'],
      ...overview.charts.revenueTrend.map((m) => [
        `${monthLabel(m.month)}${m.month === overview.currentMonth ? ' (MTD)' : ''}`,
        m.revenue,
        m.invoiced,
        ordersByMonth.get(m.month) ?? 0,
        newByMonth.get(m.month) ?? 0,
      ]),
    ],
    [14, 18, 16, 10, 14]
  );

  // 3. Top customers.
  addSheet(
    'Top Customers',
    [['Customer', 'Total Revenue (£)', 'Orders'], ...overview.charts.topCustomers.map((c) => [c.customerName, c.totalRevenue, c.orderCount])],
    [44, 18, 10]
  );

  // 4. Top products.
  addSheet(
    'Top Products',
    [
      ['Product', 'Total Qty', 'Revenue (£)', 'Orders'],
      ...overview.charts.topProducts.map((p) => [p.productName, p.totalQty, p.totalRevenue, p.orderCount]),
    ],
    [50, 12, 14, 10]
  );

  // 5. At-risk customers — the FULL list, not just the rows shown on screen.
  addSheet(
    'At-risk Customers',
    [
      ['Customer', 'Days Since Last Order Date', 'Lifetime Value (£)'],
      ...(overview.atRiskCustomers || []).map((c) => [c.customerName, c.daysSinceLastOrder, c.lifetimeValue]),
    ],
    [44, 26, 18]
  );

  // 6. Revenue distribution + repeat vs one-time.
  const repeat = overview.cards.repeatCustomers;
  addSheet(
    'Customer Mix',
    [
      ['Revenue Band', 'Customers'],
      ...overview.charts.revenueDistribution.map((b) => [b.label, b.count]),
      [''],
      ['Customer Type', 'Customers'],
      ['Repeat (2+ orders)', repeat],
      ['One-time', overview.cards.totalCustomers - repeat],
    ],
    [22, 12]
  );

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `Analytics_Dashboard_${stamp}.xlsx`, { bookType: 'xlsx', type: 'binary' });
}
