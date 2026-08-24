// Clickable, sortable column header — shared shape for every "list of
// orders" table in the app (DashboardList's server-sorted "View All" list
// and Search's client-sorted Recent Orders). Shows a neutral double-arrow
// hint on every sortable column, and the active direction once that column
// is the current sort.
export default function SortTh({ column, sortBy, sortDir, onSort, numeric, children }) {
  const active = sortBy === column;
  const classes = ['dl-sort-th', numeric ? 'dl-num' : '', active ? 'dl-sort-active' : ''].filter(Boolean).join(' ');
  return (
    <th className={classes}>
      <button
        type="button"
        className="dl-sort-btn"
        onClick={() => onSort(column)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        <span className="dl-sort-arrow" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}
