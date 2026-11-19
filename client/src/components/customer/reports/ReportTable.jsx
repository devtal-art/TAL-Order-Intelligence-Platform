import { downloadReportCsv, downloadReportExcel } from '../../../services/customer/reportService.js';

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return String(value);
}

// Generic report renderer — one table component for all 6 report types,
// since they all share the same { title, columns, rows, summary } shape
// (see server/src/services/customerReportService.js). Export buttons are
// hidden from print output via .ci-report-actions{display:none} in the
// @media print rules (customer.css) — printing is the PDF path (browser
// "Save as PDF"), so only .ci-report-printable should ever hit the page.
export default function ReportTable({ report }) {
  if (!report) return null;
  const { title, columns, rows, summary } = report;

  return (
    <div className="ci-report">
      <div className="ci-report-actions">
        <button type="button" className="dw-view" onClick={() => downloadReportCsv(report)}>Export CSV</button>
        <button type="button" className="dw-view" onClick={() => downloadReportExcel(report)}>Export Excel</button>
        <button type="button" className="dw-view" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <div className="ci-report-printable">
        <h3 className="ci-report-title">{title}</h3>

        {summary && (
          <dl className="ci-report-summary">
            {Object.entries(summary)
              .filter(([, v]) => typeof v !== 'object' || v === null)
              .map(([k, v]) => (
                <div key={k} className="ci-report-summary-row">
                  <dt>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
                  <dd>{formatCell(v)}</dd>
                </div>
              ))}
          </dl>
        )}

        {rows.length === 0 ? (
          <div className="dl-empty">No data for this report.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.portalOrderRef || r.customerName || r.productName || r.month || i}>
                    {columns.map((c) => <td key={c.key}>{formatCell(r[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
