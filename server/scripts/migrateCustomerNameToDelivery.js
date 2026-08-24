/**
 * Business change (V4.3): the stored `customer_name` field was extracted
 * from the BILLING address at save time. The Dashboard / Search / company
 * lookup should instead reflect the DELIVERY address's company name (the
 * actual site being delivered to) — Postcode already worked this way
 * (deliveryPostcode() in orderService.js has always read delivery_address).
 *
 * The write path (upsertOrder callers) now extracts customerName from
 * parsed_data.delivery_address.company_name for every NEW save. This script
 * backfills every EXISTING order's stored customer_name the same way.
 *
 * Falls back to the order's current customer_name when the delivery address
 * has no company name captured in its parsed_data snapshot — never blanks a
 * real value.
 *
 * Usage:
 *   node scripts/migrateCustomerNameToDelivery.js          (dry run — reports only, no writes)
 *   node scripts/migrateCustomerNameToDelivery.js --apply  (writes the changes)
 *
 * Idempotent: re-running after --apply finds zero further changes (every
 * order's customer_name already equals its delivery_address.company_name).
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

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB || 'order_intelligence';
  assertExpectedMongoTarget(mongoUri, mongoDbName);

  console.log(`\nConnecting to MongoDB (db: ${mongoDbName})...`);
  const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    const { default: dns } = await import('dns');
    dns.setServers(dnsServers);
    console.log(`   DNS override: ${dnsServers.join(', ')}`);
  }
  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 15000 });
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

  const orders = await Order.find(
    {},
    { portal_order_ref: 1, customer_name: 1, 'parsed_data.delivery_address.company_name': 1 }
  ).lean();

  const changes = [];
  const noDeliveryCompany = [];
  for (const doc of orders) {
    const deliveryCompany = String(doc.parsed_data?.delivery_address?.company_name || '').trim();
    const current = doc.customer_name || '';
    if (!deliveryCompany) {
      noDeliveryCompany.push(doc.portal_order_ref);
      continue; // no delivery company captured — keep the existing value, not a "change"
    }
    if (deliveryCompany !== current) {
      changes.push({ ref: doc.portal_order_ref, from: current, to: deliveryCompany });
    }
  }

  console.log(`Total orders scanned: ${orders.length}`);
  console.log(`Orders needing a customer_name update: ${changes.length}`);
  console.log(`Orders with no delivery company_name captured (left unchanged): ${noDeliveryCompany.length}`);
  if (noDeliveryCompany.length) {
    console.log(`   Refs: ${noDeliveryCompany.join(', ')}`);
  }
  console.log('\nSample of changes (first 20):');
  for (const c of changes.slice(0, 20)) {
    console.log(`   ${c.ref}: "${c.from}" -> "${c.to}"`);
  }

  if (!APPLY) {
    console.log('\nDry run only — no writes made. Re-run with --apply to commit these changes.\n');
  } else {
    let modified = 0;
    for (const c of changes) {
      const res = await Order.updateOne({ portal_order_ref: c.ref }, { $set: { customer_name: c.to } });
      if (res.modifiedCount) modified++;
    }
    console.log(`\nApplied: ${modified} order(s) updated.\n`);
  }

  await mongoose.disconnect();
  console.log('Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
