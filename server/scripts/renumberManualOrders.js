/**
 * One-off backfill — normalizes every existing "Orders - Kumkum" (manual,
 * order_source === 'MANUAL') order's portal_order_ref to the clean
 * 'KS-YYYYMMDD-N' format the app now generates automatically going forward.
 *
 * Existing refs were free-typed and are wildly inconsistent (missing dashes,
 * stray spaces, '/' instead of '-', no leading zero, sometimes no sequence
 * suffix at all). This script:
 *   1. Extracts the embedded date (8 digits) from each ref, ignoring
 *      whitespace/punctuation noise.
 *   2. Groups orders by that date.
 *   3. Within each date, assigns 1..N in upload_timestamp order (the order
 *      they were actually saved into the system) — NOT by whatever stray
 *      suffix digits happened to be typed, since those are inconsistent and
 *      not a reliable signal (e.g. a bare 'KS-20260803' and
 *      'KS-20260803 - 01' existing side by side).
 *   4. Renames portal_order_ref to 'KS-<date>-<n>'.
 *
 * One ref ('KS-202608-1') is genuinely malformed — only 6 digits, missing
 * the day — and is hardcoded below to its correct date (20260824), verified
 * against its upload_timestamp (2026-08-24) and order_date.
 *
 * Confirmed safe (see conversation/PR notes): portal_order_ref is never
 * stored as a foreign key anywhere else in the codebase — only used as the
 * Order document's own unique key and as a live query param — so renaming
 * it is fully self-contained.
 *
 * Usage:
 *   node scripts/renumberManualOrders.js            (dry run — prints the plan, writes nothing)
 *   node scripts/renumberManualOrders.js --apply     (executes the renumbering)
 *
 * Idempotent: re-running after --apply finds every ref already in the
 * 'KS-YYYYMMDD-N' shape, computes the same numbering, and reports zero
 * changes.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { assertExpectedMongoTarget } from '../src/config/mongoGuard.js';
import { Order } from '../src/models/order.model.js';

const APPLY = process.argv.includes('--apply');

// The one ref that doesn't carry a recoverable 8-digit date — confirmed via
// its upload_timestamp (2026-08-24T11:23:02Z) and order_date ('08/24/2026').
const KNOWN_DATE_OVERRIDES = {
  'KS-202608-1': '20260824',
};

function extractDate(ref) {
  if (KNOWN_DATE_OVERRIDES[ref]) return KNOWN_DATE_OVERRIDES[ref];
  const m = /(\d{8})/.exec(ref.replace(/\s+/g, ''));
  return m ? m[1] : null;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB || 'order_intelligence';
  assertExpectedMongoTarget(mongoUri, mongoDbName);

  console.log(`\n🔗 Connecting to MongoDB (db: ${mongoDbName})…`);

  const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    const { default: dns } = await import('dns');
    dns.setServers(dnsServers);
    console.log(`   DNS override: ${dnsServers.join(', ')}`);
  }

  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 15000 });
  console.log(`✅ Connected.\n${APPLY ? '⚠️  APPLY MODE — will write changes.' : '🔍 DRY RUN — no changes will be written (pass --apply to execute).'}\n`);

  const docs = await Order.find(
    { order_source: 'MANUAL' },
    { portal_order_ref: 1, upload_timestamp: 1, customer_name: 1 }
  ).sort({ upload_timestamp: 1 }).lean();

  console.log(`Found ${docs.length} manual ("Orders - Kumkum") order(s).\n`);

  const byDate = new Map();
  const unparseable = [];
  for (const d of docs) {
    const date = extractDate(d.portal_order_ref);
    if (!date) {
      unparseable.push(d);
      continue;
    }
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(d);
  }

  if (unparseable.length) {
    console.log('⚠️  Could not extract a date from these refs — SKIPPED, left untouched:');
    for (const d of unparseable) console.log(`   ${d.portal_order_ref} (${d._id})`);
    console.log('');
  }

  const plan = []; // { id, oldRef, newRef, customer }
  for (const [date, group] of [...byDate.entries()].sort()) {
    group.forEach((d, i) => {
      const newRef = `KS-${date}-${i + 1}`;
      plan.push({ id: d._id, oldRef: d.portal_order_ref, newRef, customer: d.customer_name || '' });
    });
  }

  const changed = plan.filter((p) => p.oldRef !== p.newRef);
  const unchanged = plan.filter((p) => p.oldRef === p.newRef);

  console.log(`Plan: ${changed.length} ref(s) to change, ${unchanged.length} already correct.\n`);
  console.log('Old Ref'.padEnd(22), '->', 'New Ref'.padEnd(18), 'Customer');
  console.log('-'.repeat(80));
  for (const p of plan) {
    const marker = p.oldRef === p.newRef ? '(unchanged)' : '';
    console.log(p.oldRef.padEnd(22), '->', p.newRef.padEnd(18), p.customer.slice(0, 30), marker);
  }

  // Collision guard: the new refs must be unique among themselves AND must
  // not already exist on some order OUTSIDE this plan (an order whose ref
  // isn't itself being changed here). A clash with another order that IS
  // also in this plan is expected and fine — e.g. renaming A's old ref onto
  // B's new ref while B hasn't moved yet — the two-phase apply below (via a
  // temporary placeholder ref) resolves that safely.
  const newRefCounts = new Map();
  for (const p of plan) newRefCounts.set(p.newRef, (newRefCounts.get(p.newRef) || 0) + 1);
  const dupes = [...newRefCounts.entries()].filter(([, n]) => n > 1);
  if (dupes.length) {
    console.error('\n❌ Aborting: computed duplicate new refs:', dupes.map(([r]) => r).join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }
  const planIds = new Set(plan.map((p) => String(p.id)));
  for (const p of changed) {
    const clash = await Order.findOne({ portal_order_ref: p.newRef }, { _id: 1 }).lean();
    if (clash && !planIds.has(String(clash._id))) {
      console.error(`\n❌ Aborting: new ref ${p.newRef} already exists on an order outside this plan (${clash._id}).`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  if (!APPLY) {
    console.log('\n🔍 Dry run complete — no changes written. Re-run with --apply to execute this plan.\n');
    await mongoose.disconnect();
    return;
  }

  // Two-phase apply: refs being reshuffled among each other in this same
  // batch would otherwise transiently collide with the unique index (e.g.
  // renaming order A onto the ref order B currently still holds). Phase 1
  // moves every changed order to a placeholder ref derived from its own
  // _id (guaranteed unique, and outside the 'KS-' namespace so it can never
  // collide with a real ref); phase 2 moves everything from its placeholder
  // to its real final ref, by which point every old ref has been vacated.
  for (const p of changed) {
    await Order.updateOne({ _id: p.id }, { $set: { portal_order_ref: `__RENUMBER_TMP__${p.id}` } });
  }
  let updated = 0;
  for (const p of changed) {
    await Order.updateOne({ _id: p.id }, { $set: { portal_order_ref: p.newRef } });
    updated += 1;
  }

  console.log(`\n✅ Updated ${updated} order(s).\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Renumbering failed:', err.message);
  process.exit(1);
});
