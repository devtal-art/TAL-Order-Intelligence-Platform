import { useEffect, useState } from 'react';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import ReportTable from '../../components/customer/reports/ReportTable.jsx';
import { reportService } from '../../services/customer/reportService.js';
import { customerService } from '../../services/customer/customerService.js';
import { useDebouncedValue } from '../../hooks/customer/useDebouncedValue.js';

const REPORT_TYPES = [
  { key: 'customer', label: 'Customer Report', needsCustomer: true },
  { key: 'financial', label: 'Financial Report', needsCustomer: false, customerOptional: true },
  { key: 'purchase', label: 'Purchase Report', needsCustomer: true, hasDateRange: true },
  { key: 'revenue', label: 'Revenue Report' },
  { key: 'top-products', label: 'Top Products' },
  { key: 'top-customers', label: 'Top Customers' },
];

// Reports (Phase 2, feature 10). One generic report generator + table
// (ReportTable) covering all 6 report types; export is CSV, Excel (both via
// reportService, reusing the existing `xlsx` convention), and Print/PDF
// (browser print-to-PDF — see the @media print rules in customer.css).
export default function CustomerReports() {
  const [type, setType] = useState('revenue');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeType = REPORT_TYPES.find((t) => t.key === type);
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, 300);

  // Customer name autocomplete for report types that need one.
  useEffect(() => {
    if (!debouncedCustomerQuery.trim()) {
      setCustomerOptions([]);
      return;
    }
    let cancelled = false;
    customerService
      .list({ query: debouncedCustomerQuery, limit: 8 })
      .then((r) => {
        if (!cancelled) setCustomerOptions(r.data.map((c) => c.customerName));
      })
      .catch(() => {
        if (!cancelled) setCustomerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedCustomerQuery]);

  function handleGenerate() {
    if (activeType.needsCustomer && !customerName) {
      setError('Choose a customer first.');
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    reportService
      .get({ type, customerName: customerName || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: 50 })
      .then(setReport)
      .catch((e) => setError(e.message || 'Could not generate this report.'))
      .finally(() => setLoading(false));
  }

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-reports">
        <div className="dbp-top">
          <h2>Reports</h2>
          <p>Generate a report and export it as CSV, Excel, or PDF (print).</p>
        </div>

        <div className="ci-report-type-picker">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`ci-tab${type === t.key ? ' active' : ''}`}
              onClick={() => { setType(t.key); setReport(null); setError(''); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ci-filters-panel">
          {(activeType.needsCustomer || activeType.customerOptional) && (
            <div className="ci-filter-field">
              <label htmlFor="cr-customer">
                Customer{activeType.customerOptional ? ' (optional — leave blank for all customers)' : ''}
              </label>
              <input
                id="cr-customer"
                list="cr-customer-options"
                type="text"
                value={customerName || customerQuery}
                onChange={(e) => { setCustomerName(''); setCustomerQuery(e.target.value); }}
                onBlur={(e) => { if (customerOptions.includes(e.target.value)) setCustomerName(e.target.value); }}
                placeholder="Start typing a company name…"
              />
              <datalist id="cr-customer-options">
                {customerOptions.map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
          )}
          {activeType.hasDateRange && (
            <>
              <div className="ci-filter-field">
                <label htmlFor="cr-from">Date From</label>
                <input id="cr-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="ci-filter-field">
                <label htmlFor="cr-to">Date To</label>
                <input id="cr-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="ci-filter-field ci-filters-actions">
            <button type="button" className="dw-view" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>

        {error && <div className="sol-error">{error}</div>}

        <ReportTable report={report} />
      </div>
    </CustomerLayout>
  );
}
