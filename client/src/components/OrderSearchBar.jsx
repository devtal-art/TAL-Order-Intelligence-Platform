// Instant client-side order filter by Portal Order Ref No (V1.2 · Phase 4).
// No backend call — the parent filters its in-memory order list from `value`.
export default function OrderSearchBar({ value, onChange, matchCount, totalCount }) {
  return (
    <div className="og-search">
      <svg viewBox="0 0 24 24" className="og-search-icon">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        className="og-search-input"
        placeholder="Search order by Portal Order Ref No…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search order by Portal Order Ref No"
      />
      {value && (
        <>
          <span className="og-search-count">
            {matchCount} of {totalCount}
          </span>
          <button className="og-search-clear" type="button" onClick={() => onChange('')} aria-label="Clear search">
            ×
          </button>
        </>
      )}
    </div>
  );
}
