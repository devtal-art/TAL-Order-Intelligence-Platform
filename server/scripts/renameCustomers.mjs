// One-off customer rename on existing orders (Order.customer_name only).
//
//   node scripts/renameCustomers.mjs            → dry run: shows what would change, writes nothing
//   node scripts/renameCustomers.mjs --apply    → backs up, then renames
//   node scripts/renameCustomers.mjs --undo <backup.json>
//                                               → puts the old names back on exactly those orders
//
// Only the top-level `customer_name` field is changed. The parsed email
// (parsed_data.*.company_name), every other order field, the Order Activity
// Log and the Customer delivery-days records are left untouched.
//
// Note: re-uploading one of these orders' emails (or a new email from the
// same customer) uses the company name from the email again, so the old name
// can reappear on those orders — that's how upsertOrder already works.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { Order } from '../src/models/order.model.js';

const RENAMES = [
  { from: 'Falcon Cash & Carry', to: 'FALCON CASH & CARRY LTD-2' },
  { from: 'Sira Cash & Carry (Surequote Ltd T/A)', to: 'Sira Cash & Carry (Surequote) Frozen A/c' },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.join(here, 'backups');
const args = process.argv.slice(2);
const mode = args.includes('--apply') ? 'apply' : args.includes('--undo') ? 'undo' : 'dry';

await connectDB();
try {
  if (mode === 'undo') {
    const file = args[args.indexOf('--undo') + 1];
    if (!file) throw new Error('Usage: --undo <backup.json>');
    const backup = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    let restored = 0;
    for (const o of backup.orders) {
      // Only restore orders still carrying the name this script gave them.
      const r = await Order.updateOne({ _id: o._id, customer_name: o.to }, { $set: { customer_name: o.from } });
      restored += r.modifiedCount;
    }
    console.log(`Undo: restored ${restored} of ${backup.orders.length} orders from ${file}`);
  } else {
    const affected = [];
    for (const { from, to } of RENAMES) {
      const orders = await Order.find({ customer_name: from }, { _id: 1, portal_order_ref: 1 }).lean();
      const targetCount = await Order.countDocuments({ customer_name: to });
      console.log(`"${from}" → "${to}": ${orders.length} order(s) to move (target currently has ${targetCount})`);
      for (const o of orders) affected.push({ _id: o._id, portal_order_ref: o.portal_order_ref, from, to });
    }

    if (mode === 'dry') {
      console.log(`\nDry run — nothing changed. ${affected.length} order(s) would be renamed. Re-run with --apply.`);
    } else {
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `customer-rename-${stamp}.json`);
      fs.writeFileSync(backupFile, JSON.stringify({ createdAt: new Date().toISOString(), renames: RENAMES, orders: affected }, null, 2));
      console.log(`\nBackup written: ${backupFile}`);

      let changed = 0;
      for (const o of affected) {
        const r = await Order.updateOne({ _id: o._id, customer_name: o.from }, { $set: { customer_name: o.to } });
        changed += r.modifiedCount;
      }
      console.log(`Renamed ${changed} of ${affected.length} order(s).`);
      for (const { from, to } of RENAMES) {
        console.log(`  now: "${from}" = ${await Order.countDocuments({ customer_name: from })}, "${to}" = ${await Order.countDocuments({ customer_name: to })}`);
      }
      console.log(`\nTo undo: node scripts/renameCustomers.mjs --undo "${backupFile}"`);
    }
  }
} finally {
  await mongoose.disconnect();
}
