/**
 * Read-only export — every order with no Processed By (processed_by empty
 * or missing, i.e. what the UI shows as "Not Assigned"), one row per line
 * item, with the product name/quantity as they appeared in the original
 * email (parsed_data.line_items) plus the resolved catalog Item No — but
 * the Item No is only ever filled in for a line whose resolution result is
 * 'approved' (resolution_data.results[].status), since that's the only
 * status with a confirmed match.itemNo; an unapproved/needs_review line has
 * no real item number to report, so it's left blank rather than guessed.
 * Mirrors the exact lineId <-> line_items index logic
 * server/src/utils/dashboardWorkbook.js uses, so batch-uploaded orders
 * (lineId "<orderIdx>-<index+1>") line up correctly too.
 *
 * Usage:
 *   node scripts/exportNotAssignedOrders.js
 *
 * Writes an .xlsx to server/exports/. Never modifies the database.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { assertExpectedMongoTarget } from '../src/config/mongoGuard.js';
import { Order } from '../src/models/order.model.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

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

  const orders = await Order.find(
    { $or: [{ processed_by: '' }, { processed_by: { $exists: false } }] },
    { portal_order_ref: 1, customer_name: 1, order_date: 1, 'parsed_data.line_items': 1, 'resolution_data.results': 1 }
  ).sort({ portal_order_ref: 1 }).lean();

  console.log(`Found ${orders.length} Not Assigned order(s).`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Order Intelligence Platform';
  wb.created = new Date();

  const ws = wb.addWorksheet('Not Assigned Orders');
  ws.columns = [
    { header: 'Order #', key: 'ref', width: 16 },
    { header: 'Customer', key: 'customer', width: 40 },
    { header: 'Order Date', key: 'orderDate', width: 14 },
    { header: 'Item No (Approved Only)', key: 'itemNo', width: 20 },
    { header: 'Product Name (Email)', key: 'productName', width: 50 },
    { header: 'Quantity (Email)', key: 'qty', width: 14 },
  ];

  let orderCount = 0;
  let rowCount = 0;
  let approvedCount = 0;
  for (const o of orders) {
    orderCount += 1;
    const items = Array.isArray(o.parsed_data?.line_items) ? o.parsed_data.line_items : [];
    if (items.length === 0) {
      // No parsed line items at all — still list the order so it isn't
      // silently dropped from the sheet, with the item columns blank.
      ws.addRow({ ref: o.portal_order_ref, customer: o.customer_name || '', orderDate: o.order_date || '', itemNo: '', productName: '', qty: '' });
      rowCount += 1;
      continue;
    }

    // resolution_data.results carries the authoritative lineId per line —
    // "<index+1>" for a single upload, "<orderIdx>-<index+1>" for a batch
    // upload (the email line index is always the last hyphen segment).
    // Falls back to a plain 1-based index when there's no resolution data
    // at all yet, matching every line to an empty (unapproved) result.
    const results = Array.isArray(o.resolution_data?.results) && o.resolution_data.results.length
      ? o.resolution_data.results
      : items.map((_, i) => ({ lineId: String(i + 1) }));
    // Index results by their target line_items position so every email
    // line item gets exactly one output row even if a result is missing.
    const resultByLineIndex = new Map();
    for (const r of results) {
      const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
      if (Number.isInteger(lineIndex) && lineIndex >= 0) resultByLineIndex.set(lineIndex, r);
    }

    items.forEach((item, lineIndex) => {
      const r = resultByLineIndex.get(lineIndex);
      const approved = r?.status === 'approved' && r.match?.itemNo;
      if (approved) approvedCount += 1;
      ws.addRow({
        ref: o.portal_order_ref,
        customer: o.customer_name || '',
        orderDate: o.order_date || '',
        itemNo: approved ? r.match.itemNo : '',
        productName: item.description || '',
        qty: item.qty ?? '',
      });
      rowCount += 1;
    });
  }

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `Not Assigned Orders ${new Date().toISOString().slice(0, 10)}.xlsx`);
  await wb.xlsx.writeFile(outPath);

  console.log(`\n📄 Wrote ${rowCount} row(s) across ${orderCount} order(s) (${approvedCount} with an approved Item No) to:\n   ${outPath}\n`);

  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Export failed:', err.message);
  process.exit(1);
});
