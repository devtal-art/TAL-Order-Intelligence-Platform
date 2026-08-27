// Shared multi-term search parsing for the Product Search feature (V5.1).
// Mirrors server/src/utils/searchTerms.js — terms are separated by '#' with
// no surrounding space (e.g. "Item A#71616#Item B"). Blank terms and exact
// duplicates (case-insensitive) are dropped; order of first appearance is
// preserved.
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

// Turns pasted Excel-column text (one product name / item number per line,
// separated by newlines — and if a whole row was selected, separated by
// tabs too) into the platform's '#'-joined search-query format. Splitting
// on tabs as well as newlines means pasting a single Excel row (not just a
// column) also bifurcates correctly instead of landing as one run-on term.
export function bifurcatePastedText(text) {
  const parts = String(text ?? '')
    .split(/[\r\n\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join('#');
}
