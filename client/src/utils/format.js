// Formatting helpers.

// Human-readable file size. Verbatim from the original single-file build.
export const fmtSz = b => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';

// Currency symbol for a parsed currency code. Extracted verbatim from the
// inline ternary previously used in showResults — same output for all inputs.
export const currencySymbol = c => c==='USD'?'$':c==='EUR'?'€':'£';
