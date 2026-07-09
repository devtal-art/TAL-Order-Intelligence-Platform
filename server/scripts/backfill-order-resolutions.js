import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Order } from '../src/models/order.model.js';
import { ApprovedMapping } from '../src/models/approvedMapping.model.js';
import { Product } from '../src/models/product.model.js';
import { normalizeName } from '../src/utils/normalizeName.js';
import { deriveStatus } from '../src/services/orderService.js';
import { findBestMatch, normalizeForMatch, tokenize, MATCH_THRESHOLD } from '../src/services/resolveService.js';

// Re-syncs the resolution snapshot of every saved Order with the CURRENT
// ApprovedMapping collection. Orders store resolution_data as a point-in-time
// snapshot taken at upload, so mapping corrections (e.g. the corrected
// "Approved Products" sheet sync) never reach previously saved orders on their
// own — this script applies them retroactively.
//
// Per resolution line (same shapes resolveService.resolveProducts produces):
//   - an active mapping now exists and the line disagrees (not approved, or
//     approved against a different item)          → line becomes approved
//   - the line is approved but no active mapping exists for its name — every
//     approval is mapping-backed, so its mapping was deleted as obsolete
//                                                  → line reverts to needs_review
//     (with a fresh matching-engine suggestion, exactly like a new upload)
//   - otherwise                                    → line untouched
//
// The order's resolution_status is recomputed. parsed_data and
// product_comments are never touched.
//
// Usage:
//   node scripts/backfill-order-resolutions.js            (dry run)
//   node scripts/backfill-order-resolutions.js --apply    (write)
//
// Idempotent: a second run finds nothing to change.

function approvedLine(line, mapping) {
  return {
    lineId: line.lineId,
    emailProductName: line.emailProductName,
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

function needsReviewLine(line, catalogEntries) {
  const best = catalogEntries.length ? findBestMatch(line.emailProductName, catalogEntries) : null;
  if (best && best.matchScore >= MATCH_THRESHOLD) {
    return {
      lineId: line.lineId,
      emailProductName: line.emailProductName,
      status: 'needs_review',
      confidence: null,
      reason: 'Suggested match found — manual approval required.',
      source: 'matching_engine',
      match: null,
      suggestedProduct: {
        websiteProductName: best.websiteProductName,
        itemNo: best.itemNo,
        matchScore: best.matchScore,
      },
      candidates: [{ websiteProductName: best.websiteProductName, itemNo: best.itemNo, matchPercent: best.matchScore }],
    };
  }
  return {
    lineId: line.lineId,
    emailProductName: line.emailProductName,
    status: 'needs_review',
    confidence: null,
    reason: 'No approved mapping and no confident catalog match.',
    source: null,
    match: null,
    suggestedProduct: null,
    candidates: [],
  };
}

async function main() {
  const apply = process.argv.includes('--apply');

  await connectDB();
  const summary = {
    orders: 0,
    ordersChanged: 0,
    linesUpgraded: 0, // needs_review → approved (new mapping now covers it)
    linesCorrected: 0, // approved → approved with a different item (mapping was fixed)
    linesDowngraded: 0, // approved → needs_review (its mapping was removed)
  };

  try {
    const mappings = await ApprovedMapping.find({ status: 'active' }).lean();
    const mappingByNorm = new Map(mappings.map((m) => [m.normalized_email_name, m]));

    // Loaded once; only needed to give downgraded lines a fresh suggestion.
    const prods = await Product.find({}, { item_no: 1, name: 1, _id: 0 }).lean();
    const catalogEntries = prods.map((p) => {
      const norm = normalizeForMatch(p.name);
      return { name: p.name, item_no: p.item_no, norm, tokens: tokenize(norm) };
    });

    const orders = await Order.find({}).lean();
    summary.orders = orders.length;

    for (const order of orders) {
      const results = Array.isArray(order.resolution_data?.results) ? order.resolution_data.results : [];
      if (!results.length) continue;

      const changes = [];
      const nextResults = results.map((line) => {
        if (!line || !line.emailProductName) return line;
        const mapping = mappingByNorm.get(normalizeName(line.emailProductName));
        const isApproved = line.status === 'approved';

        if (mapping) {
          if (isApproved && line.match?.itemNo === mapping.item_no) return line; // already in sync
          const next = approvedLine(line, mapping);
          if (isApproved) {
            summary.linesCorrected += 1;
            changes.push(`~ line ${line.lineId}: "${line.emailProductName}" ${line.match?.itemNo} → ${mapping.item_no}`);
          } else {
            summary.linesUpgraded += 1;
            changes.push(`+ line ${line.lineId}: "${line.emailProductName}" approved → ${mapping.item_no}`);
          }
          return next;
        }

        if (isApproved) {
          summary.linesDowngraded += 1;
          changes.push(`- line ${line.lineId}: "${line.emailProductName}" was ${line.match?.itemNo}, mapping removed → needs review`);
          return needsReviewLine(line, catalogEntries);
        }
        return line;
      });

      if (!changes.length) continue;
      summary.ordersChanged += 1;

      const resolution_data = { ...order.resolution_data, results: nextResults };
      const resolution_status = deriveStatus(resolution_data);

      console.log(
        `\n${order.portal_order_ref} (${order.customer_name || 'unknown customer'}) — ` +
          `${order.resolution_status} → ${resolution_status}`
      );
      for (const c of changes) console.log(`  ${c}`);

      if (apply) {
        await Order.updateOne({ _id: order._id }, { $set: { resolution_data, resolution_status } });
      }
    }

    console.log('');
    console.log(`Backfill summary${apply ? '' : ' (dry run — pass --apply to write)'}`);
    console.log('─────────────────────────────────────');
    console.log(`Orders scanned          ${summary.orders}`);
    console.log(`Orders updated          ${summary.ordersChanged}`);
    console.log(`Lines newly approved    ${summary.linesUpgraded}`);
    console.log(`Lines re-pointed        ${summary.linesCorrected}`);
    console.log(`Lines back to review    ${summary.linesDowngraded}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exitCode = 1;
});
