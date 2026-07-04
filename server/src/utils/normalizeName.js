// Canonical product-name normalization.
//
// This is the single normalization function the platform uses at CSV ingest
// (and, later, at resolution lookup and mapping creation). Keeping it in one
// place guarantees the same name always normalizes to the same key.
//
// v1 rules (conservative, deterministic): lowercase, collapse internal
// whitespace to a single space, and trim.
export function normalizeName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
