/**
 * One-off reclassification (V3.3) — retires the 'Unknown' order_status
 * value entirely:
 *   1. A named list of Portal Order Refs → 'Order Hold'.
 *   2. Every remaining order currently 'Unknown' (or, defensively, still
 *      missing order_status altogether) → 'Order Released'.
 *
 * After this runs, no order should have order_status === 'Unknown' or be
 * missing the field — 'Unknown' is also removed from the schema enum
 * (order.model.js) and every UI surface, so it can no longer be produced
 * going forward either.
 *
 * Usage:
 *   node scripts/migrateOrderHoldAndRelease.js
 *
 * Idempotent in the sense that matters here: step 1 unconditionally
 * (re)asserts these specific, named orders as 'Order Hold' — a deliberate,
 * one-time business classification, same pattern as migrateOrderStatus.js's
 * 11-ref Cancelled list. Step 2 only matches 'Unknown'/missing, which
 * disappears after the first run, so re-running is a full no-op.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { assertExpectedMongoTarget } from '../src/config/mongoGuard.js';
import { Order } from '../src/models/order.model.js';

// Portal Order Ref No — NOT MongoDB _id.
const HOLD_REFS = ['827', '826', '821', '811', '795', '315'];

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
  console.log('✅ Connected.\n');

  const holdResult = await Order.updateMany(
    { portal_order_ref: { $in: HOLD_REFS } },
    { $set: { order_status: 'Order Hold' } }
  );
  console.log(
    `   📦 Order Hold: ${holdResult.matchedCount} matched, ${holdResult.modifiedCount} updated (of ${HOLD_REFS.length} listed refs).`
  );

  const releasedResult = await Order.updateMany(
    {
      portal_order_ref: { $nin: HOLD_REFS },
      $or: [{ order_status: 'Unknown' }, { order_status: { $exists: false } }],
    },
    { $set: { order_status: 'Order Released' } }
  );
  console.log(
    `   📦 Order Released (was Unknown/unset): ${releasedResult.matchedCount} matched, ${releasedResult.modifiedCount} updated.`
  );

  const remainingUnknown = await Order.countDocuments({ order_status: 'Unknown' });
  console.log(`\n   🔎 Orders still marked 'Unknown' after this run: ${remainingUnknown} (expect 0).`);

  console.log(`\n📊 Summary: ${holdResult.modifiedCount + releasedResult.modifiedCount} order(s) updated this run.\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
