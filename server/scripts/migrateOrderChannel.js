/**
 * One-time backfill (V3.5): classifies every existing order's Order Channel
 * — the business-facing source label the Dashboard will bifurcate on later
 * (frontend work tracked separately) — and writes it to the new, additive
 * `order_channel` field.
 *
 * Classification signal: the EXISTING `order_source` field (V3.1), set at
 * creation time by the only two order-creation code paths (HTML upload vs.
 * Manual Order Creation) — not inferred or guessed after the fact:
 *   • order_source === 'MANUAL'                → 'Order - Kumkum'
 *   • order_source === 'HTML' or missing        → 'Orders - Email'
 *     (missing = saved before V3.1 introduced the field, i.e. necessarily
 *     via the HTML flow, since Manual Order Creation and order_source were
 *     added together — there is no historical code path that could produce
 *     a manually-created order with order_source unset)
 *   • anything else (order_source present but neither 'HTML' nor 'MANUAL')
 *     → left UNCLASSIFIED and reported, never guessed.
 *
 * A secondary signal (filename: manual orders always save '', HTML orders
 * always save the real uploaded filename) is cross-checked for anomalies —
 * any MANUAL order with a non-empty filename is also reported instead of
 * being silently trusted.
 *
 * Usage:
 *   node scripts/migrateOrderChannel.js            # dry run (read-only, default)
 *   node scripts/migrateOrderChannel.js --apply     # perform the writes
 *
 * Idempotent: only ever matches documents where order_channel does not yet
 * exist ({ order_channel: { $exists: false } }), so a second run — with or
 * without --apply — modifies zero documents. Only order_channel is ever
 * written; every other field is left untouched.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { assertExpectedMongoTarget } from '../src/config/mongoGuard.js';
import { Order } from '../src/models/order.model.js';
import { ORDER_CHANNELS } from '../src/services/orderService.js';

const APPLY = process.argv.includes('--apply');
const [EMAIL_CHANNEL, MANUAL_CHANNEL] = ORDER_CHANNELS; // 'Orders - Email', 'Order - Kumkum'

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB || 'order_intelligence';
  assertExpectedMongoTarget(mongoUri, mongoDbName);

  console.log(`\n🔗 Connecting to MongoDB (db: ${mongoDbName})…`);
  const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    const { default: dns } = await import('dns');
    dns.setServers(dnsServers);
  }
  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 15000 });
  console.log(`✅ Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (read-only)'}\n`);

  const col = mongoose.connection.db.collection('orders');

  const totalOrders = await col.countDocuments({});
  const alreadyClassified = await col.countDocuments({ order_channel: { $exists: true } });
  const toClassify = totalOrders - alreadyClassified;

  const manualMatch = { order_channel: { $exists: false }, order_source: 'MANUAL' };
  const emailMatch = {
    order_channel: { $exists: false },
    $or: [{ order_source: 'HTML' }, { order_source: { $exists: false } }],
  };
  const unclassifiedMatch = {
    order_channel: { $exists: false },
    order_source: { $exists: true, $nin: ['HTML', 'MANUAL'] },
  };

  const manualCount = await col.countDocuments(manualMatch);
  const emailCount = await col.countDocuments(emailMatch);
  const unclassifiedCount = await col.countDocuments(unclassifiedMatch);

  // Secondary-signal anomaly check: a MANUAL order should never have a real
  // filename. Any that do are pulled OUT of the manual bucket and reported
  // instead of being written — the two signals disagreeing means we cannot
  // confidently classify that order.
  const manualAnomalies = await col
    .find({ ...manualMatch, filename: { $exists: true, $ne: '' } }, { projection: { portal_order_ref: 1, filename: 1 } })
    .toArray();
  const manualAnomalyRefs = new Set(manualAnomalies.map((r) => r.portal_order_ref));
  const cleanManualCount = manualCount - manualAnomalies.length;

  console.log('========================================');
  console.log('ORDER CHANNEL MIGRATION — DRY RUN REPORT');
  console.log('========================================');
  console.log(`Total existing orders:            ${totalOrders}`);
  console.log(`Already classified (idempotent):  ${alreadyClassified}`);
  console.log(`Remaining to classify:            ${toClassify}`);
  console.log(`  → '${MANUAL_CHANNEL}':           ${cleanManualCount}`);
  console.log(`  → '${EMAIL_CHANNEL}':            ${emailCount}`);
  console.log(`  → Unclassifiable (bad order_source): ${unclassifiedCount}`);
  console.log(`  → Unclassifiable (signals disagree): ${manualAnomalies.length}`);

  if (unclassifiedCount > 0) {
    const rows = await col
      .find(unclassifiedMatch, { projection: { portal_order_ref: 1, order_source: 1 } })
      .toArray();
    console.log('\nOrders with an unrecognized order_source value (NOT migrated):');
    rows.forEach((r) => console.log(`  #${r.portal_order_ref} — order_source=${JSON.stringify(r.order_source)}`));
  }

  if (manualAnomalies.length > 0) {
    console.log('\nOrders where order_source=\'MANUAL\' but filename is non-empty (NOT migrated — signals disagree):');
    manualAnomalies.forEach((r) => console.log(`  #${r.portal_order_ref} — filename=${JSON.stringify(r.filename)}`));
  }

  console.log('\nSample records that WOULD be classified:');
  const sampleManual = await col
    .find({ ...manualMatch, portal_order_ref: { $nin: [...manualAnomalyRefs] } }, { projection: { portal_order_ref: 1, customer_name: 1, filename: 1 } })
    .limit(5)
    .toArray();
  console.log(`  '${MANUAL_CHANNEL}':`);
  if (!sampleManual.length) console.log('    (none)');
  sampleManual.forEach((r) => console.log(`    #${r.portal_order_ref} — ${r.customer_name || '(no customer)'} — filename=${JSON.stringify(r.filename)}`));

  const sampleEmail = await col
    .find(emailMatch, { projection: { portal_order_ref: 1, customer_name: 1, filename: 1 } })
    .limit(5)
    .toArray();
  console.log(`  '${EMAIL_CHANNEL}':`);
  sampleEmail.forEach((r) => console.log(`    #${r.portal_order_ref} — ${r.customer_name || '(no customer)'} — filename=${JSON.stringify(r.filename)}`));

  if (!APPLY) {
    console.log('\n🧪 Dry run only — no documents were modified. Re-run with --apply to write.\n');
    await mongoose.disconnect();
    return;
  }

  console.log('\n✍️  Applying updates…');

  const manualResult = await Order.updateMany(
    { ...manualMatch, portal_order_ref: { $nin: [...manualAnomalyRefs] } },
    { $set: { order_channel: MANUAL_CHANNEL } }
  );
  console.log(`   '${MANUAL_CHANNEL}': ${manualResult.matchedCount} matched, ${manualResult.modifiedCount} updated.`);

  const emailResult = await Order.updateMany(emailMatch, { $set: { order_channel: EMAIL_CHANNEL } });
  console.log(`   '${EMAIL_CHANNEL}': ${emailResult.matchedCount} matched, ${emailResult.modifiedCount} updated.`);

  // Post-apply verification.
  const stillUnclassified = await col.countDocuments({ order_channel: { $exists: false } });
  const finalManual = await col.countDocuments({ order_channel: MANUAL_CHANNEL });
  const finalEmail = await col.countDocuments({ order_channel: EMAIL_CHANNEL });
  const finalTotal = await col.countDocuments({});

  console.log('\n========================================');
  console.log('POST-APPLY VERIFICATION');
  console.log('========================================');
  console.log(`Total orders (unchanged, no docs created/deleted): ${finalTotal} (was ${totalOrders})`);
  console.log(`'${MANUAL_CHANNEL}': ${finalManual}`);
  console.log(`'${EMAIL_CHANNEL}': ${finalEmail}`);
  console.log(`Still unclassified (expected = ${unclassifiedCount + manualAnomalies.length}): ${stillUnclassified}`);

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
