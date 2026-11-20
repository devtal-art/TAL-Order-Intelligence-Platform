import { useCallback, useEffect, useRef, useState } from 'react';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import ReportTable from '../../components/customer/reports/ReportTable.jsx';
import { reportService } from '../../services/customer/reportService.js';
import { customerService } from '../../services/customer/customerService.js';
import { useDebouncedValue } from '../../hooks/customer/useDebouncedValue.js';

// needsCustomer → can't run until a customer is chosen.
// customerOptional → runs for all customers when left blank.
// Anything that needs no input is generated as soon as its tab is opened.
const REPORT_TYPES = [
  { key: 'customer', label: 'Customer Report', needsCustomer: true, desc: 'Every order for one customer — date, status, products and total.' },
  { key: 'financial', label: 'Financial Report', customerOptional: true, desc: 'Month-by-month revenue, for one customer or across all customers.' },
  { key: 'purchase', label: 'Purchase Report', needsCustomer: true, hasDateRange: true, desc: 'One customer’s purchases, optionally narrowed to a date range.' },
  { key: 'revenue', label: 'Revenue Report', desc: 'Revenue, order count and average order value for each customer.' },
  { key: 'top-products', label: 'Top Products', desc: 'Best-selling products by revenue, with quantity and order count.' },
  { key: 'top-customers', label: 'Top Customers', desc: 'Highest-revenue customers, with their order count and largest order.' },
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

  // Only the latest request may update the page — switching tabs while a
  // report is loading must never show the previous tab's result.
  const requestSeq = useRef(0);

  const activeType = REPORT_TYPES.find((t) => t.key === type);
  const showCustomer = activeType.needsCustomer || activeType.customerOptional;
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

  const generate = useCallback((reportType, params) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    setReport(null);
    reportService
      .get({ type: reportType, limit: 50, ...params })
      .then((r) => { if (seq === requestSeq.current) setReport(r); })
      .catch((e) => { if (seq === requestSeq.current) setError(e.message || 'Could not generate this report.'); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, []);

  // Reports that need no input load straight away (initial tab + tab switch).
  function runIfReady(t) {
    if (!t.needsCustomer) {
      generate(t.key, t.customerOptional && customerName ? { customerName } : {});
    }
  }

  useEffect(() => {
    runIfReady(activeType);
    // Initial load only — tab switches call runIfReady directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectType(t) {
    if (t.key === type) return;
    requestSeq.current += 1; // drop any in-flight result from the old tab
    setType(t.key);
    setReport(null);
    setError('');
    setLoading(false);
    runIfReady(t);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (activeType.needsCustomer && !customerName) {
      setError('Choose a customer from the list first.');
      return;
    }
    generate(type, {
      customerName: showCustomer && customerName ? customerName : undefined,
      dateFrom: activeType.hasDateRange && dateFrom ? dateFrom : undefined,
      dateTo: activeType.hasDateRange && dateTo ? dateTo : undefined,
    });
  }

  function handleCustomerChange(value) {
    setCustomerQuery(value);
    // Picking a suggestion fires a change with the exact name — accept it
    // immediately rather than waiting for the field to lose focus.
    setCustomerName(customerOptions.includes(value) ? value : '');
  }

  const hasInputs = showCustomer || activeType.hasDateRange;
  const waitingForCustomer = activeType.needsCustomer && !customerName && !report && !loading && !error;

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-reports">
        <div className="dbp-top">
          <h2>Reports</h2>
          <p>Generate a report and export it as CSV, Excel, or PDF (print).</p>
        </div>

        <div className="ci-report-type-picker" role="tablist" aria-label="Report type">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={type === t.key}
              className={`ci-tab${type === t.key ? ' active' : ''}`}
              onClick={() => selectType(t)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form className="ci-report-panel" onSubmit={handleSubmit}>
          <div className="ci-report-panel-info">
            <div className="ci-report-panel-title">{activeType.label}</div>
            <div className="ci-report-panel-desc">{activeType.desc}</div>
          </div>

          <div className={`ci-report-panel-controls${hasInputs ? '' : ' is-bare'}`}>
            {showCustomer && (
              <div className="ci-filter-field ci-report-customer">
                <label htmlFor="cr-customer">
                  Customer{activeType.customerOptional ? ' (optional)' : ''}
                </label>
                <input
                  id="cr-customer"
                  list="cr-customer-options"
                  type="text"
                  value={customerQuery}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  onBlur={(e) => { if (customerOptions.includes(e.target.value)) setCustomerName(e.target.value); }}
                  placeholder={activeType.customerOptional ? 'All customers' : 'Start typing a company name…'}
                  autoComplete="off"
                />
                <datalist id="cr-customer-options">
                  {customerOptions.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
            )}
            {activeType.hasDateRange && (
              <>
                <div className="ci-filter-field">
                  <label htmlFor="cr-from">Order Date From</label>
                  <input id="cr-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="ci-filter-field">
                  <label htmlFor="cr-to">Order Date To</label>
                  <input id="cr-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </>
            )}
            <button type="submit" className="ci-report-generate" disabled={loading}>
              {loading ? 'Generating…' : hasInputs ? 'Generate Report' : 'Refresh'}
            </button>
          </div>
        </form>

        {error && <div className="sol-error">{error}</div>}

        {loading && <div className="dl-empty ci-report-status">Generating {activeType.label.toLowerCase()}…</div>}
        {waitingForCustomer && (
          <div className="dl-empty ci-report-status">Choose a customer above, then click <b>Generate Report</b>.</div>
        )}

        <ReportTable report={report} />
      </div>
    </CustomerLayout>
  );
}
