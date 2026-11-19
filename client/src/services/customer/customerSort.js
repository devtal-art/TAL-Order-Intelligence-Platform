// Customer List sort options — ONE list shared by the sortable column
// headers, the sort dropdown and the Excel export label, so all three always
// agree. `key` values are the API's `sort` param (see listCustomers on the
// server); `defaultDir` is the direction a column starts in when first
// clicked (text A→Z, numbers/dates highest/newest first).
export const SORT_COLUMNS = [
  { key: 'name', defaultDir: 'asc', asc: 'Customer (A–Z)', desc: 'Customer (Z–A)' },
  { key: 'postcode', defaultDir: 'asc', asc: 'Postcode (A–Z)', desc: 'Postcode (Z–A)' },
  { key: 'orders', defaultDir: 'desc', desc: 'Orders (most)', asc: 'Orders (fewest)' },
  { key: 'revenue', defaultDir: 'desc', desc: 'Ordered value (highest)', asc: 'Ordered value (lowest)' },
  { key: 'invoiced', defaultDir: 'desc', desc: 'Invoiced (highest)', asc: 'Invoiced (lowest)' },
  { key: 'avg', defaultDir: 'desc', desc: 'Avg order value (highest)', asc: 'Avg order value (lowest)' },
  { key: 'recent', defaultDir: 'desc', desc: 'Last ordered (most recent)', asc: 'Last ordered (longest ago)' },
];

export const DEFAULT_SORT = { key: 'revenue', dir: 'desc' };

export const defaultDirFor = (key) => SORT_COLUMNS.find((c) => c.key === key)?.defaultDir || 'desc';

export function sortLabel({ key, dir }) {
  const col = SORT_COLUMNS.find((c) => c.key === key) || SORT_COLUMNS.find((c) => c.key === DEFAULT_SORT.key);
  return col[dir === 'asc' || dir === 'desc' ? dir : col.defaultDir];
}
