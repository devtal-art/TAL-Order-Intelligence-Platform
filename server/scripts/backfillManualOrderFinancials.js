/**
 * One-off backfill — recomputes financials.sub_total / financials.total for
 * every existing manual ("Orders - Kumkum", order_source === 'MANUAL')
 * order from its actual parsed_data.line_items.
 *
 * Before this, manual orders always saved financials.sub_total as a
 * hardcoded 0 (see manualOrderBuilder.js's old buildFinancialsFromMasterTotals),
 * and financials.total was only ever whatever the user manually typed into
 * Master Totals rows (often left blank/0, since it was an easy-to-forget
 * extra step). OrderFinancials.jsx hides its entire card when there's
 * nothing to show (sub_total 0, total 0, no discounts) — so these orders'
 * financial summary was invisible on the Saved Order detail view. This
 * mirrors the fix already made to the live create/edit flows:
 *   sub_total = sum of every line item's Total (qty x unit price)
 *   total     = sub_total + transportation_charges + sum(discounts[].amount)
 * Any existing discounts[]/transportation_charges (from Master Totals rows
 * the user DID fill in) are preserved as-is — only sub_total/total change.
 * HTML orders are never touched — their sub_total is the figure parsed from
 * the original order email, an independent business record.
 *
 * Usage:
 *   node scripts/backfillManualOrderFinancials.js            (dry run — prints the plan, writes nothing)
 *   node scripts/backfillManualOrderFinancials.js --apply     (executes the backfill)
 *
 * Idempotent: re-running after --apply recomputes the same numbers from the
 * same line items and reports zero changes (unless line items changed since).
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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Same formula as client/src/utils/manualProduct.js's recomputeManualSubtotal.
function recompute(financials, lineItems) {
  const subTotal = round2((lineItems || []).reduce((sum, it) => sum + (Number(it.total) || 0), 0));
  const f = financials || {};
  const transport = Number(f.transportation_charges) || 0;
  const adjustments = Array.isArray(f.discounts)
    ? f.discounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    : 0;
  const total = round2(subTotal + transport + adjustments);
  return { sub_total: subTotal, total };
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
    { portal_order_ref: 1, customer_name: 1, parsed_data: 1 }
  ).sort({ portal_order_ref: 1 }).lean();

  console.log(`Found ${docs.length} manual order(s).\n`);

  const plan = [];
  for (const d of docs) {
    const items = Array.isArray(d.parsed_data?.line_items) ? d.parsed_data.line_items : [];
    const oldSub = Number(d.parsed_data?.financials?.sub_total) || 0;
    const oldTotal = Number(d.parsed_data?.financials?.total) || 0;
    const { sub_total, total } = recompute(d.parsed_data?.financials, items);
    plan.push({ id: d._id, ref: d.portal_order_ref, customer: d.customer_name || '', oldSub, oldTotal, sub_total, total });
  }

  const changed = plan.filter((p) => p.oldSub !== p.sub_total || p.oldTotal !== p.total);

  console.log(`Plan: ${changed.length} order(s) to update, ${plan.length - changed.length} already correct.\n`);
  console.log('Ref'.padEnd(18), 'Old Sub -> New Sub'.padEnd(24), 'Old Total -> New Total'.padEnd(26), 'Customer');
  console.log('-'.repeat(100));
  for (const p of plan) {
    const marker = p.oldSub === p.sub_total && p.oldTotal === p.total ? '(unchanged)' : '';
    console.log(
      p.ref.padEnd(18),
      `${p.oldSub.toFixed(2)} -> ${p.sub_total.toFixed(2)}`.padEnd(24),
      `${p.oldTotal.toFixed(2)} -> ${p.total.toFixed(2)}`.padEnd(26),
      p.customer.slice(0, 30),
      marker
    );
  }

  if (!APPLY) {
    console.log('\n🔍 Dry run complete — no changes written. Re-run with --apply to execute this plan.\n');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const p of changed) {
    await Order.updateOne(
      { _id: p.id },
      { $set: { 'parsed_data.financials.sub_total': p.sub_total, 'parsed_data.financials.total': p.total } }
    );
    updated += 1;
  }

  console.log(`\n✅ Updated ${updated} order(s).\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Backfill failed:', err.message);
  process.exit(1);
});
