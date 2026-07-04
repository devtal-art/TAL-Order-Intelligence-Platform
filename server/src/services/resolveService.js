import { ApprovedMapping } from '../models/approvedMapping.model.js';
import { Product } from '../models/product.model.js';
import { getStatus as getCatalogStatus } from './catalogService.js';
import { normalizeName } from '../utils/normalizeName.js';
import { AppError } from '../utils/AppError.js';

// ────────────────────────────────────────────────
//  MATCHING ENGINE (pure functions — unit-testable, no DB)
// ────────────────────────────────────────────────
//
// Matching runs ONLY when no approved mapping exists. It compares the email
// product name against every product in the active catalog and returns the
// single highest-scoring product (never a Top-5, never an auto-approval).
//
// Normalization for matching is intentionally stricter than the canonical
// `normalizeName` (it also strips punctuation) and is used ONLY for scoring —
// the approved-mapping lookup still uses `normalizeName`, so stored keys are
// unaffected.

// lowercase → strip punctuation → collapse spaces → trim.
export function normalizeForMatch(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(normStr) {
  return normStr ? normStr.split(' ').filter(Boolean) : [];
}

// Classic Levenshtein edit distance (iterative, two-row).
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// 1 - normalized edit distance. Whole-string closeness (typos, ordering, extra words). 0..1
export function stringSimilarity(aNorm, bNorm) {
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(aNorm, bNorm) / maxLen;
}

// Sørensen–Dice on unique token sets. Word-level overlap regardless of order. 0..1
export function tokenSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  let common = 0;
  for (const t of setA) {
    if (setB.has(t)) common += 1;
  }
  return (2 * common) / (setA.size + setB.size);
}

// Fraction of email tokens that appear as a substring of the product string.
// Rewards "widget" matching inside "blue widget 500ml". 0..1
export function partialSimilarity(aTokens, bNorm) {
  if (!aTokens.length) return 0;
  let hit = 0;
  for (const t of aTokens) {
    if (bNorm.includes(t)) hit += 1;
  }
  return hit / aTokens.length;
}

// Hybrid weights (sum to 1) and the minimum score to surface a suggestion.
export const WEIGHTS = { token: 0.5, string: 0.3, partial: 0.2 };
export const MATCH_THRESHOLD = 45; // 0..100

// Score one email name against one precomputed catalog entry. Returns 0..100.
export function scoreMatch(emailName, product) {
  const aNorm = normalizeForMatch(emailName);
  const aTokens = tokenize(aNorm);
  const bNorm = product.norm ?? normalizeForMatch(product.name);
  const bTokens = product.tokens ?? tokenize(bNorm);

  const tSim = tokenSimilarity(aTokens, bTokens);
  const sSim = stringSimilarity(aNorm, bNorm);
  const pSim = partialSimilarity(aTokens, bNorm);

  return Math.round((WEIGHTS.token * tSim + WEIGHTS.string * sSim + WEIGHTS.partial * pSim) * 100);
}

// Return ONLY the single best-scoring product (or null for an empty catalog).
// `catalogEntries`: [{ name, item_no, norm, tokens }]
export function findBestMatch(emailName, catalogEntries) {
  const aNorm = normalizeForMatch(emailName);
  const aTokens = tokenize(aNorm);

  let best = null;
  for (const entry of catalogEntries) {
    const tSim = tokenSimilarity(aTokens, entry.tokens);
    const sSim = stringSimilarity(aNorm, entry.norm);
    const pSim = partialSimilarity(aTokens, entry.norm);
    const matchScore = Math.round((WEIGHTS.token * tSim + WEIGHTS.string * sSim + WEIGHTS.partial * pSim) * 100);
    if (!best || matchScore > best.matchScore) {
      best = { websiteProductName: entry.name, itemNo: entry.item_no, matchScore };
    }
  }
  return best;
}

// ────────────────────────────────────────────────
//  RESOLUTION PIPELINE
// ────────────────────────────────────────────────
export async function resolveProducts(products) {
  const catalog = await getCatalogStatus();
  if (catalog.status !== 'active') {
    throw new AppError('NO_ACTIVE_CATALOG', 'No active product catalog. Upload a catalog before resolving.', {
      status: 409,
    });
  }

  const normalizedList = products.map((p) => normalizeName(p.name));
  const uniqueNorms = [...new Set(normalizedList)];

  // 1) Approved-mapping fast path (unchanged).
  const found = await ApprovedMapping.find({
    normalized_email_name: { $in: uniqueNorms },
    status: 'active',
  }).lean();
  const byNorm = new Map(found.map((m) => [m.normalized_email_name, m]));

  // 2) Load the catalog once, only if something actually needs matching.
  const needMatching = products.some((p, i) => !byNorm.get(normalizedList[i]));
  let catalogEntries = [];
  if (needMatching) {
    const prods = await Product.find({}, { item_no: 1, name: 1, _id: 0 }).lean();
    catalogEntries = prods.map((p) => {
      const norm = normalizeForMatch(p.name);
      return { name: p.name, item_no: p.item_no, norm, tokens: tokenize(norm) };
    });
  }

  const results = products.map((p, i) => {
    const mapping = byNorm.get(normalizedList[i]);

    // Approved mapping exists → return it. Matching is NOT run.
    if (mapping) {
      return {
        lineId: p.lineId,
        emailProductName: p.name,
        status: 'approved',
        confidence: 100,
        reason: 'Previously approved manually.',
        source: 'approved_mapping',
        match: {
          websiteProductName: mapping.website_product_name,
          itemNo: mapping.item_no,
          mappingId: mapping._id,
        },
        candidates: [],
      };
    }

    // No mapping → run the matching engine for a single suggestion.
    const best = catalogEntries.length ? findBestMatch(p.name, catalogEntries) : null;

    if (best && best.matchScore >= MATCH_THRESHOLD) {
      return {
        lineId: p.lineId,
        emailProductName: p.name,
        status: 'needs_review', // suggestion only — never auto-approved
        confidence: null,
        reason: 'Suggested match found — manual approval required.',
        source: 'matching_engine',
        match: null,
        suggestedProduct: {
          websiteProductName: best.websiteProductName,
          itemNo: best.itemNo,
          matchScore: best.matchScore,
        },
        // Mirror the suggestion into the contract's `candidates` (single item).
        candidates: [{ websiteProductName: best.websiteProductName, itemNo: best.itemNo, matchPercent: best.matchScore }],
      };
    }

    return {
      lineId: p.lineId,
      emailProductName: p.name,
      status: 'needs_review',
      confidence: null,
      reason: 'No approved mapping and no confident catalog match.',
      source: null,
      match: null,
      suggestedProduct: null,
      candidates: [],
    };
  });

  return { catalogVersion: catalog.version, results };
}
