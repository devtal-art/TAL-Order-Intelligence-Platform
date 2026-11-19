import { useState } from 'react';
import { SORT_COLUMNS } from '../../services/customer/customerSort.js';

// Search + sort controls for the Customer List page. Deliberately
// uncontrolled-by-parent-render-cycle: keystrokes are debounced by the
// caller (CustomerList), this component just reports raw values.
export default function CustomerSearchBar({ query, onQueryChange, sort, onSortChange }) {
  const [localQuery, setLocalQuery] = useState(query);

  function handleChange(e) {
    const v = e.target.value;
    setLocalQuery(v);
    onQueryChange(v);
  }

  return (
    <div className="ci-searchbar">
      <div className="ci-search-input-wrap">
        <svg className="ci-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="ci-search-input"
          placeholder="Search by company name…"
          value={localQuery}
          onChange={handleChange}
          aria-label="Search customers"
        />
      </div>
      {/* Same options (column + direction) as the clickable table headers —
          `sort` is { key, dir } and the two stay in sync both ways. */}
      <select
        className="ci-sort-select"
        value={`${sort.key}:${sort.dir}`}
        onChange={(e) => {
          const [key, dir] = e.target.value.split(':');
          onSortChange({ key, dir });
        }}
        aria-label="Sort customers by"
      >
        {SORT_COLUMNS.flatMap((c) => {
          const dirs = c.defaultDir === 'asc' ? ['asc', 'desc'] : ['desc', 'asc'];
          return dirs.map((d) => (
            <option key={`${c.key}:${d}`} value={`${c.key}:${d}`}>Sort: {c[d]}</option>
          ));
        })}
      </select>
    </div>
  );
}
