/**
 * One-off backfill — sets the new `order_status` field (V3.2) on existing
 * orders that predate it.
 *
 * Usage:
 *   node scripts/migrateOrderStatus.js
 *
 * A fixed list of 11 Portal Order Refs become 'Order Cancelled'; every other
 * order becomes 'Unknown' (the legacy/default value — never a normal
 * user-selectable status, see order.model.js).
 *
 * Idempotent: both updates only match documents where order_status does not
 * yet exist, so re-running this script is always a no-op on the second pass
 * — and it will never overwrite a status a user has since set through the
 * application itself.
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
const CANCELLED_REFS = ['790', '787', '781', '780', '779', '763', '761', '733', '707', '678', '537'];

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

  const cancelledResult = await Order.updateMany(
    { portal_order_ref: { $in: CANCELLED_REFS }, order_status: { $exists: false } },
    { $set: { order_status: 'Order Cancelled' } }
  );
  console.log(
    `   📦 Order Cancelled: ${cancelledResult.matchedCount} matched, ${cancelledResult.modifiedCount} updated (of ${CANCELLED_REFS.length} listed refs).`
  );

  const unknownResult = await Order.updateMany(
    { portal_order_ref: { $nin: CANCELLED_REFS }, order_status: { $exists: false } },
    { $set: { order_status: 'Unknown' } }
  );
  console.log(`   📦 Unknown (all other existing orders): ${unknownResult.matchedCount} matched, ${unknownResult.modifiedCount} updated.`);

  console.log(`\n📊 Summary: ${cancelledResult.modifiedCount + unknownResult.modifiedCount} order(s) backfilled this run.\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
