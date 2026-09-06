import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import SortTh from '../components/SortableHeader.jsx';
import { orderService } from '../services/orderService.js';
import { PROCESSED_BY_USERS } from '../utils/order.js';

const PAGE_SIZE = 25;

// "View All" for the Dashboard's Recent Activity widget — the full,
// paginated cross-order Activity Log (GET /v1/orders/logs/recent), filtered
// by date and/or Order Number. Same URL-params-drive-everything pattern as
// DashboardList.jsx, so filters survive a refresh/back-navigation.
export default function ActivityLogList() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const date = params.get('date') || '';
  const ref = params.get('ref') || '';
  const actor = params.get('actor') || '';
  // Every column is sortable (Order #, Done By, Message, When) — default
  // matches the previous hardcoded newest-first-by-When behavior.
  const sortBy = params.get('sortBy') || 'when';
  const sortDir = params.get('sortDir') === 'asc' ? 'asc' : 'desc';

  // Local draft for the Order Number text field — applied on submit rather
  // than on every keystroke, same reasoning SavedOrderLookup's search uses.
  const [refDraft, setRefDraft] = useState(ref);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      .recentActivity({ page, limit: PAGE_SIZE, date: date || undefined, portalOrderRef: ref || undefined, actor: actor || undefined, sortBy, sortDir })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load the activity log.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, date, ref, actor, sortBy, sortDir]);

  // Clicking a header sorts by it (ascending first); clicking the same
  // header again flips direction — same behavior as DashboardList.jsx.
  const toggleSort = (column) => {
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      next.set('sortBy', column);
      next.set('sortDir', nextDir);
      return next;
    });
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      if (refDraft.trim()) next.set('ref', refDraft.trim());
      else next.delete('ref');
      return next;
    });
  };

  const setDate = (value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      if (value) next.set('date', value);
      else next.delete('date');
      return next;
    });
  };

  const setActor = (value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      if (value) next.set('actor', value);
      else next.delete('actor');
      return next;
    });
  };

  const clearFilters = () => {
    setRefDraft('');
    setParams({ page: '1' });
  };

  const gotoPage = (p) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  const openOrder = useCallback(async (portalOrderRef) => {
    setViewBusyRef(portalOrderRef);
    setError('');
    try {
      setViewOrder(await orderService.get(portalOrderRef));
    } catch (e) {
      setError(e.message || `Could not open order ${portalOrderRef}.`);
    } finally {
      setViewBusyRef('');
    }
  }, []);

  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  const rows = result?.data || [];
  const total = result?.meta?.total ?? 0;
  const pages = result?.meta?.pages ?? 1;
  const hasFilters = Boolean(date || ref || actor);

  return (
    <Layout>
      <div className="screen active" id="s-activity-log-list">
        <div className="dl-head">
          <Link className="dl-back" to="/dashboard">← Back to Dashboard</Link>
          <h2 className="dl-title">
            <span className="os-badge os-released">Activity Log</span>
            All order activity
          </h2>
          {!loading && (
            <span className="dl-total">
              {total} entr{total === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>

        <form className="al-filters" onSubmit={applyFilters}>
          <div className="al-filter-field">
            <label htmlFor="al-date" className="al-filter-label">Date</label>
            <input
              id="al-date"
              type="date"
              className="sol-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="al-filter-field al-filter-field--grow">
            <label htmlFor="al-ref" className="al-filter-label">Order Number</label>
            <input
              id="al-ref"
              type="text"
              className="sol-input"
              placeholder="e.g. 10025487"
              value={refDraft}
              onChange={(e) => setRefDraft(e.target.value)}
            />
          </div>
          <div className="al-filter-field">
            <label htmlFor="al-actor" className="al-filter-label">Done By</label>
            <select
              id="al-actor"
              className="sol-input"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              <option value="">All</option>
              {PROCESSED_BY_USERS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <button className="sol-btn" type="submit">Apply</button>
          {hasFilters && (
            <button className="sol-edit-btn" type="button" onClick={clearFilters}>Clear</button>
          )}
        </form>

        {error && <div className="sol-error">{error}</div>}

        {loading && !result ? (
          <div className="dw-loading">Loading activity…</div>
        ) : rows.length === 0 ? (
          <div className="dl-empty">
            {hasFilters ? 'No activity found for these filters.' : 'No activity recorded yet.'}
          </div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <SortTh column="ref" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Order #</SortTh>
                  <SortTh column="actor" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Done By</SortTh>
                  <SortTh column="message" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Message</SortTh>
                  <SortTh column="when" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>When</SortTh>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="dl-ref">{entry.portalOrderRef}</td>
                    <td>{entry.actor}</td>
                    <td>{entry.message}</td>
                    <td>{fmtWhen(entry.createdAt)}</td>
                    <td className="dl-act">
                      <button
                        className="dw-view"
                        type="button"
                        onClick={() => openOrder(entry.portalOrderRef)}
                        disabled={viewBusyRef === entry.portalOrderRef}
                      >
                        {viewBusyRef === entry.portalOrderRef ? '…' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="dl-pager">
            <button className="dl-page-btn" type="button" disabled={page <= 1 || loading} onClick={() => gotoPage(page - 1)}>
              ← Previous
            </button>
            <span className="dl-page-info">
              Page {page} of {pages}
            </span>
            <button className="dl-page-btn" type="button" disabled={page >= pages || loading} onClick={() => gotoPage(page + 1)}>
              Next →
            </button>
          </div>
        )}

        {viewOrder && (
          <SavedOrderDetailModal
            order={viewOrder}
            onClose={() => setViewOrder(null)}
            onDownload={() => downloadOrderExcel(viewOrder)}
            onSaved={(updated) => setViewOrder(updated)}
          />
        )}
      </div>
    </Layout>
  );
}
