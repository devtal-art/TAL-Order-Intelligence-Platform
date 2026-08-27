// Shared multi-term search parsing for the Product Search feature (V5.1).
// Terms are separated by '#' with no surrounding space (e.g.
// "Item A#71616#Item B") — this mirrors client/src/utils/searchTerms.js so
// the same raw query string always splits into the same terms whether it
// was typed, pasted from Excel, or loaded from a bookmarked results URL.
// Blank terms and exact duplicates (case-insensitive) are dropped; order of
// first appearance is preserved.
export function parseSearchTerms(raw) {
  const seen = new Set();
  const terms = [];
  for (const part of String(raw ?? '').split('#')) {
    const term = part.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

export const MAX_SEARCH_TERMS = 100;
