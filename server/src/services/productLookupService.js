import { Product } from '../models/product.model.js';
import { ApprovedMapping } from '../models/approvedMapping.model.js';
import { normalizeName } from '../utils/normalizeName.js';
import { productDisplayName } from '../utils/displayName.js';

// Multi-term product lookup (V5.1) — the Search page's "Search Products"
// feature. Given a list of raw search terms (already split by the caller
// via parseSearchTerms), finds the catalog item each term refers to,
// whether the user typed the WEBSITE product name, the EMAIL product name
// from the original order (only known once a human has approved a mapping
// for it — see ApprovedMapping), or the raw Item Number. The three are
// deliberately not asked for separately: a term is tried against all of
// them.
//
// Exact match only (V5.2 — tightened per feedback: fuzzy/partial matching
// surfaced the wrong item for a mistyped or truncated entry, e.g. a partial
// paste like "ewheat Chapati Fa" was silently "matching" a whole different
// product). A term must equal an item number, a website name, or an
// approved email name exactly (case/whitespace-insensitive) — anything
// else comes back with zero matches so the caller can flag it as invalid
// instead of showing a guessed result.
const MAX_MATCHES_PER_TERM = 10;

export async function lookupProducts(terms) {
  const products = await Product.find({}, { item_no: 1, name: 1, option: 1, _id: 0 }).lean();
  const mappings = await ApprovedMapping.find(
    { status: 'active' },
    { email_product_name: 1, item_no: 1, _id: 0 }
  ).lean();

  // One entry per catalog item, keyed by lowercased item number — the join
  // key between the catalog (website names) and approved mappings (email
  // names). `searchNames` holds every normalized name variant (website +
  // every approved email name) this item can be found by exact match.
  const itemIndex = new Map();
  for (const p of products) {
    const key = String(p.item_no || '').trim().toLowerCase();
    if (!key) continue;
    const websiteProductName = productDisplayName(p.name, p.option);
    itemIndex.set(key, {
      itemNo: p.item_no,
      websiteProductName,
      emailProductNames: [],
      searchNames: new Set([normalizeName(websiteProductName)]),
    });
  }
  for (const m of mappings) {
    const key = String(m.item_no || '').trim().toLowerCase();
    const entry = itemIndex.get(key);
    if (!entry) continue; // mapping points at an item no longer in the active catalog
    const name = String(m.email_product_name || '').trim();
    if (!name) continue;
    if (!entry.emailProductNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      entry.emailProductNames.push(name);
      entry.searchNames.add(normalizeName(name));
    }
  }

  const allItems = [...itemIndex.values()];

  const results = terms.map((term) => {
    const raw = term.trim();
    const rawLower = raw.toLowerCase();
    const normalized = normalizeName(raw);

    const hits = [];
    for (const entry of allItems) {
      const itemNoExact = entry.itemNo.toLowerCase() === rawLower;
      const nameExact = normalized.length > 0 && entry.searchNames.has(normalized);
      if (itemNoExact || nameExact) hits.push(entry);
    }

    hits.sort((a, b) => a.websiteProductName.localeCompare(b.websiteProductName));

    const matches = hits.slice(0, MAX_MATCHES_PER_TERM).map((entry) => ({
      itemNo: entry.itemNo,
      websiteProductName: entry.websiteProductName,
      emailProductNames: entry.emailProductNames,
    }));

    return { term: raw, matches };
  });

  const matchedTermCount = results.filter((r) => r.matches.length > 0).length;
  return { data: results, meta: { termCount: terms.length, matchedTermCount } };
}
