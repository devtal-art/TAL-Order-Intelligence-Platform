// Canonical website-product display name (V1.5).
//
// The website catalog sheet carries an optional "Option" column (pack/variant,
// e.g. "Box10"). Everywhere a website product name is SHOWN it is rendered as
// "Name (Option)"; matching, normalization and mapping keys keep using the raw
// name only. Keeping this in one place guarantees every surface (resolve,
// search, saved orders) renders the same string.
export function productDisplayName(name, option) {
  const n = String(name ?? '').trim();
  const o = String(option ?? '').trim();
  return o ? `${n} (${o})` : n;
}
