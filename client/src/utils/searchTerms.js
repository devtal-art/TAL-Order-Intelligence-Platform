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
