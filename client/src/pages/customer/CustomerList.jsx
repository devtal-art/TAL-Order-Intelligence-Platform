import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import CustomerSearchBar from '../../components/customer/CustomerSearchBar.jsx';
import CustomerFilterChips, { EMPTY_CUSTOMER_FILTERS, describeCustomerFilters } from '../../components/customer/CustomerFilterChips.jsx';
import { customerService } from '../../services/customer/customerService.js';
import { downloadCustomerListExcel } from '../../services/customer/customerListExport.js';
import { DEFAULT_SORT, defaultDirFor, sortLabel } from '../../services/customer/customerSort.js';
import SortTh from '../../components/SortableHeader.jsx';
import { currencySymbol } from '../../utils/format.js';
import { useDebouncedValue } from '../../hooks/customer/useDebouncedValue.js';

const PAGE_SIZE = 25;

const EMPTY_FILTERS = EMPTY_CUSTOMER_FILTERS;

// One count per filter (a Min/Max pair counts once), for the "Filters (n)" badge.
const FILTER_GROUPS = [
  ['postCode'], ['ordersMin', 'ordersMax'], ['revenueMin', 'revenueMax'], ['invoiced'],
  ['invoicedMin', 'invoicedMax'], ['avgMin', 'avgMax'], ['lastDaysMin', 'lastDaysMax'],
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Whole calendar days between the last order and today (local time), so an
// order placed late yesterday reads "1 day ago", not "Today".
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((startOf(new Date()) - startOf(d)) / 86400000));
}

function formatDaysAgo(iso) {
  const n = daysSince(iso);
  if (n === null) return '—';
  if (n === 0) return 'Today';
  if (n === 1) return '1 day ago';
  return `${n} days ago`;
}

// Customer Intelligence — Customer List: searchable, sortable, filterable,
// paginated list of customers derived live from the Orders collection.
// Phase 2 adds the advanced filters panel (order #, product, item #,
// revenue range, date range, status) on top of Phase 1's name search + sort.
export default function CustomerList() {
  const [query, setQuery] = useState('');
  // { key, dir } — set by the sortable column headers or the sort dropdown.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const debouncedQuery = useDebouncedValue(query, 250);
  const debouncedFilters = useDebouncedValue(filters, 250);

  // Search term + sort + filters as one comparable key. When it changes the
  // list goes back to page 1 — done inside the fetch effect (not a separate
  // effect) so a filter change on page 2+ makes ONE request for page 1,
  // instead of first fetching the stale page and then page 1 again.
  const fetchKey = JSON.stringify([debouncedQuery, sort.key, sort.dir, debouncedFilters]);
  const lastFetchKey = useRef(fetchKey);

  useEffect(() => {
    if (lastFetchKey.current !== fetchKey) {
      lastFetchKey.current = fetchKey;
      if (page !== 1) {
        setPage(1); // re-runs this effect with page 1
        return undefined;
      }
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    customerService
      .list({ query: debouncedQuery, sort: sort.key, dir: sort.dir, page, limit: PAGE_SIZE, grouped: '1', ...debouncedFilters })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load customers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey encodes debouncedQuery/sort/debouncedFilters
  }, [fetchKey, page]);

  // True from the first keystroke until fresh results arrive — drives the
  // "Updating…" indicator so the old rows never look like the new answer.
  const updating = Boolean(result) && (loading || query !== debouncedQuery || filters !== debouncedFilters);

  const rows = result?.data || [];
  const total = result?.meta?.total ?? 0;
  const pages = result?.meta?.pages ?? 1;
  // Customer groups are rows in the same table (a group row = one list row);
  // the count above the table is of individual customers, members included.
  const groupRowIds = rows.filter((r) => r.isGroup).map((r) => r.groupId);
  const overallTotal = result?.meta?.customerTotal ?? total;
  const activeFilterCount = FILTER_GROUPS.filter((keys) => keys.some((k) => String(filters[k] ?? '').trim() !== '')).length;

  // Group rows: collapsed by default. While a search or filter is active they
  // open automatically, so matching customers inside a group are visible
  // straight away (each can still be collapsed by hand).
  const [expanded, setExpanded] = useState({});
  const searching = Boolean(debouncedQuery.trim()) || FILTER_GROUPS.some((keys) => keys.some((k) => String(debouncedFilters[k] ?? '').trim() !== ''));
  useEffect(() => {
    if (searching) setExpanded((e) => ({ ...e, ...Object.fromEntries(groupRowIds.map((id) => [id, true])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-evaluate only when the search/filters/results change
  }, [fetchKey, searching, groupRowIds.join('|')]);

  // Header click: same column flips direction; a new column starts in its
  // natural direction (text A→Z, numbers/dates highest/newest first).
  function handleSort(key) {
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: defaultDirFor(key) }));
  }

  // Export — fetches EVERY customer matching the current search + filters +
  // sort (all pages, not just the visible 25) and downloads it as Excel.
  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const all = await customerService.list({ query, sort: sort.key, dir: sort.dir, ...filters, all: '1' });
      const sym = currencySymbol(all.data[0]?.currency || rows[0]?.currency);
      downloadCustomerListExcel(all.data, {
        query,
        sortText: sortLabel(sort),
        filterLines: describeCustomerFilters(filters, sym),
        currencySymbol: sym,
      });
    } catch (e) {
      setError(e.message || 'Could not export customers.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-list">
        <div className="dbp-top">
          <h2>Customers</h2>
          <p>Browse and search every customer with at least one saved order.</p>
        </div>

        <div className="ci-searchbar-row">
          <CustomerSearchBar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} />
          <button
            type="button"
            className="ci-export-btn"
            onClick={handleExport}
            disabled={exporting || !result || overallTotal === 0}
            title={activeFilterCount || query ? 'Export the customers matching your search and filters' : 'Export all customers'}
          >
            {exporting ? (
              <span className="ci-export-spin" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>

        <div className="ci-chips-row">
          <CustomerFilterChips
            filters={filters}
            onChange={setFilters}
            onClearAll={() => setFilters(EMPTY_FILTERS)}
            currencySymbol={currencySymbol(rows[0]?.currency)}
          />
          <span className={`ci-updating${updating ? ' is-on' : ''}`} role="status" aria-live="polite">
            {updating ? 'Updating…' : ''}
          </span>
          {/* Customer total — shown above the table (moved from below it). */}
          {result && (
            <span className="ci-total-count">
              <strong>{overallTotal.toLocaleString('en-GB')}</strong> customer{overallTotal === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading && !result ? (
          <div className="dw-loading">Loading customers…</div>
        ) : rows.length === 0 ? (
          <div className="dl-empty">
            {query || activeFilterCount ? 'No customers match these filters.' : 'No customers found yet — process an order to get started.'}
          </div>
        ) : (
          <>
            <div className={`dl-table-wrap${updating ? ' ci-table-updating' : ''}`}>
              <table className="dl-table">
                <CustomerTableHead sort={sort} onSort={handleSort} />
                <tbody>
                  {rows.map((c) => (c.isGroup ? (
                    <CustomerGroupRows
                      key={`group:${c.groupId}`}
                      g={c}
                      open={Boolean(expanded[c.groupId])}
                      onToggle={() => setExpanded((e) => ({ ...e, [c.groupId]: !e[c.groupId] }))}
                    />
                  ) : (
                    <CustomerRow key={c.customerName} c={c} />
                  )))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="dl-pager">
                <button className="dl-page-btn" type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  ← Previous
                </button>
                <span className="dl-page-info">Page {page} of {pages}</span>
                <button className="dl-page-btn" type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </CustomerLayout>
  );
}

const money2 = (n) => Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Column headers — shared by the main table and every group table, so a
// header click sorts all of them the same way.
function CustomerTableHead({ sort, onSort }) {
  return (
    <thead>
      <tr>
        {/* Clickable sortable headers — reuses the app's shared SortTh (read-only use). */}
        <SortTh column="name" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Customer</SortTh>
        <SortTh column="postcode" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Postcode</SortTh>
        <SortTh column="orders" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Orders</SortTh>
        <SortTh column="revenue" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Ordered Value</SortTh>
        <SortTh column="invoiced" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Invoiced</SortTh>
        <SortTh column="avg" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Avg Order Value</SortTh>
        <SortTh column="recent" sortBy={sort.key} sortDir={sort.dir} onSort={onSort}>Last Ordered</SortTh>
      </tr>
    </thead>
  );
}

// One customer row. `member` = shown under an expanded group row (indented).
function CustomerRow({ c, member = false }) {
  const sym = currencySymbol(c.currency);
  return (
    <tr className={member ? 'ci-member-row' : undefined}>
      <td>
        {/* Company name is the link to the profile. */}
        <Link
          className="ci-name-link"
          to={`/customers/${encodeURIComponent(c.customerName)}`}
          title={`View profile — ${c.customerName}`}
        >
          {c.customerName}
        </Link>
      </td>
      <td>{c.postCode || <span className="dl-muted">—</span>}</td>
      <td className="dl-num">{c.orderCount}</td>
      <td className="dl-num">{sym}{money2(c.totalRevenue)}</td>
      <td
        className="dl-num"
        title={c.invoicedOrderCount
          ? `${c.invoicedOrderCount} of ${c.orderCount} order${c.orderCount === 1 ? '' : 's'} marked as Lit Invoice`
          : 'No orders marked as Lit Invoice'}
      >
        {c.invoicedOrderCount
          ? `${c.invoicedValue < 0 ? '-' : ''}${sym}${money2(Math.abs(c.invoicedValue))}`
          : <span className="dl-muted">—</span>}
      </td>
      <td className="dl-num">{sym}{money2(c.avgOrderValue)}</td>
      <td title={formatDate(c.lastOrderDate)}>{formatDaysAgo(c.lastOrderDate)}</td>
    </tr>
  );
}

// A customer group inside the table: one row with the group's combined
// figures (same columns as a customer), and — when opened — its member
// customers listed directly underneath, indented.
function CustomerGroupRows({ g, open, onToggle }) {
  const sym = currencySymbol(g.currency);
  return (
    <>
      <tr className={`ci-group-row${open ? ' is-open' : ''}`}>
        <td>
          <button type="button" className="ci-group-toggle" onClick={onToggle} aria-expanded={open} title={open ? 'Hide group customers' : 'Show group customers'}>
            <svg className="ci-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
            <span className="ci-group-name">{g.customerName}</span>
            <span className="ci-group-count">{g.memberCount}</span>
          </button>
        </td>
        <td><span className="dl-muted">{g.memberCount > 1 ? 'Multiple' : g.members[0]?.postCode || '—'}</span></td>
        <td className="dl-num">{g.orderCount}</td>
        <td className="dl-num">{sym}{money2(g.totalRevenue)}</td>
        <td className="dl-num" title={g.invoicedOrderCount ? `${g.invoicedOrderCount} of ${g.orderCount} orders marked as Lit Invoice` : 'No orders marked as Lit Invoice'}>
          {g.invoicedOrderCount ? `${g.invoicedValue < 0 ? '-' : ''}${sym}${money2(Math.abs(g.invoicedValue))}` : <span className="dl-muted">—</span>}
        </td>
        <td className="dl-num">{sym}{money2(g.avgOrderValue)}</td>
        <td title={formatDate(g.lastOrderDate)}>{formatDaysAgo(g.lastOrderDate)}</td>
      </tr>
      {open && g.members.map((m) => <CustomerRow key={m.customerName} c={m} member />)}
    </>
  );
}
