import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { connectDB } from '../src/config/db.js';
import { Order } from '../src/models/order.model.js';
import { normalizeName } from '../src/utils/normalizeName.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ONE-TIME MIGRATION — F4U product comments
//
//  Reads the two Food4U sheets in the repo root ("F4U- SC.xlsx", "F4U-AT.xlsx")
//  and writes per-product comments onto EXISTING orders in MongoDB. This is a
//  standalone script — no API, no UI, no reusable feature. Orders are never
//  created; only the Comment field (product_comments.<lineId>) is written, the
//  exact same field the Order Details comment selector edits, so migrated
//  comments stay fully editable and nothing becomes read-only.
//
//  Sheet layout (every worksheet, repeated blocks separated by blank rows):
//      <order ref> [customer / date / …]
//      Sr. No | Item. Co. | Des. | Qnt. | Price. | Status | Comments | Remarks
//      1      | 71617     | Humza Humza Masala Fries 18x400g | …
//
//  Comment is decided by the FONT colour of the product name ("Des.") only —
//  fill/background/highlight colours are ignored:
//      black font                        → 'Released'
//      red   font + item number present  → 'OS'
//      red   font + item number missing  → 'N/A'
//
//  Product matching within the matched order (never across orders):
//      1. by Item Number (against the line's approved item number), when the
//         sheet row has one;
//      2. otherwise (or when no line carries that item) by normalized product
//         name. Each order line can be claimed only once, so duplicate sheet
//         rows cannot double-claim a line.
//
//  Usage (from server/):
//      node scripts/migrate-f4u-comments.js            (dry run — report only)
//      node scripts/migrate-f4u-comments.js --apply    (write to MongoDB)
//
//  The migration is idempotent: re-running --apply sets the same values again.
//  Rollback: pre-migration state had zero comments, so
//      db.orders.updateMany({}, { $set: { product_comments: {} } })
//  restores it exactly.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_FILES = [path.join(ROOT, 'F4U- SC.xlsx'), path.join(ROOT, 'F4U-AT.xlsx')];

const COL_SR = 1;
const COL_ITEM_NO = 2;
const COL_NAME = 3;

// ── Cell helpers ──

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim();
    if (value.result !== undefined) return cellToString(value.result);
    if (value.text !== undefined) return String(value.text).trim();
    return String(value).trim();
  }
  return String(value).trim();
}

// Legacy indexed palette entries that render red (older workbooks).
const RED_INDEXED = new Set([2, 10, 60]);

// Whether one exceljs colour object ({ argb } | { theme } | { indexed }) is red.
// Theme/automatic colours are Office text themes — treated as black.
function isRedColor(color) {
  if (!color) return false;
  if (color.argb) {
    const argb = String(color.argb).toUpperCase();
    if (argb.length !== 8) return false;
    const r = parseInt(argb.slice(2, 4), 16);
    const g = parseInt(argb.slice(4, 6), 16);
    const b = parseInt(argb.slice(6, 8), 16);
    return r >= 0x99 && g <= 0x66 && b <= 0x66; // FF0000, C00000, CC3333…
  }
  if (color.indexed !== undefined) return RED_INDEXED.has(Number(color.indexed));
  return false;
}

// Effective FONT colour of a cell (fills/backgrounds ignored). Rich-text cells
// are red when any visible run is red.
function isRedFont(cell) {
  const v = cell.value;
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.some((run) => run.text && run.text.trim() && isRedColor(run.font?.color));
  }
  return isRedColor(cell.font?.color);
}

// An item number is "present" only when the cell holds an actual code
// (contains a digit) — placeholders like "N.A", "NA" or "-" count as missing.
function hasItemNumber(raw) {
  return /\d/.test(String(raw ?? ''));
}

// Business rules: black → Released; red + item → OS; red + no item → N/A.
function deriveComment({ red, itemPresent }) {
  if (!red) return 'Released';
  return itemPresent ? 'OS' : 'N/A';
}

// ── Sheet parsing ──

const isBlankRow = (row) => {
  for (let c = 1; c <= 8; c += 1) {
    if (cellToString(row.getCell(c).value)) return false;
  }
  return true;
};

const isColumnHeaderRow = (row) => /^sr\.?\s*no/i.test(cellToString(row.getCell(COL_SR).value));

// An order-ref row starts a block: a plain integer in column A.
const refOf = (row) => {
  const s = cellToString(row.getCell(COL_SR).value);
  return /^\d+$/.test(s) ? s : '';
};

// Walk every worksheet of one workbook and split it into order blocks.
function extractOrderBlocks(workbook, filename, skippedRows) {
  const blocks = [];

  for (const sheet of workbook.worksheets) {
    let state = 'seek'; // 'seek' = looking for the next order ref; 'products' = inside a table
    let candidateRef = '';
    let current = null;

    for (let n = 1; n <= sheet.rowCount; n += 1) {
      const row = sheet.getRow(n);

      if (isBlankRow(row)) {
        state = 'seek';
        candidateRef = '';
        current = null;
        continue;
      }

      if (isColumnHeaderRow(row)) {
        if (candidateRef) {
          current = { ref: candidateRef, products: [] };
          blocks.push(current);
        } else {
          current = null; // orphan table with no ref above it
        }
        state = 'products';
        continue;
      }

      if (state === 'seek') {
        const ref = refOf(row);
        if (ref) candidateRef = ref; // date/customer rows are simply passed over
        continue;
      }

      // state === 'products' — a data row of the current table.
      const where = `${filename} · ${sheet.name} · row ${n}`;
      if (!current) {
        skippedRows.push({ where, reason: 'product row in a table with no order ref above it' });
        continue;
      }
      const nameCell = row.getCell(COL_NAME);
      const name = cellToString(nameCell.value);
      if (!name) {
        skippedRows.push({ where, reason: 'missing product name' });
        continue;
      }
      current.products.push({
        where,
        name,
        itemNo: cellToString(row.getCell(COL_ITEM_NO).value),
        red: isRedFont(nameCell),
      });
    }
  }

  return blocks;
}

// ── Migration ──

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const files = args.filter((a) => a !== '--apply');
  const sources = files.length ? files.map((f) => path.resolve(f)) : DEFAULT_FILES;

  // 1. Parse both workbooks. One bad file aborts before any DB access.
  const skippedRows = [];
  const byRef = new Map(); // ref → { ref, products: [] } merged across files/sheets
  let totalRows = 0;

  for (const file of sources) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(file);
    } catch (e) {
      console.error(`Cannot read "${file}": ${e.message}`);
      process.exit(1);
    }
    const blocks = extractOrderBlocks(workbook, path.basename(file), skippedRows);
    for (const block of blocks) {
      totalRows += block.products.length;
      const existing = byRef.get(block.ref);
      if (existing) existing.products.push(...block.products);
      else byRef.set(block.ref, { ref: block.ref, products: [...block.products] });
    }
  }

  const summary = {
    ordersInSheets: byRef.size,
    ordersFound: 0,
    ordersNotFound: 0,
    productRows: totalRows + skippedRows.length,
    productsMatched: 0,
    productsNotMatched: 0,
    released: 0,
    os: 0,
    na: 0,
    rowsSkipped: skippedRows.length,
    rowsFailed: 0,
    rowsUpdated: 0,
  };
  const notFoundRefs = [];
  const unmatchedProducts = [];
  const matchedByItem = { item: 0, name: 0 };

  await connectDB();
  try {
    // 2. One query for all orders in the sheets.
    const refs = [...byRef.keys()];
    const orders = await Order.find(
      { portal_order_ref: { $in: refs } },
      { portal_order_ref: 1, resolution_data: 1, parsed_data: 1 }
    ).lean();
    const orderByRef = new Map(orders.map((o) => [o.portal_order_ref, o]));

    const bulkOps = [];

    for (const { ref, products } of byRef.values()) {
      const order = orderByRef.get(ref);
      if (!order) {
        summary.ordersNotFound += 1;
        notFoundRefs.push(ref);
        continue;
      }
      summary.ordersFound += 1;

      // Index this order's own lines: lineId + normalized email name + the
      // approved item number (identity is only confirmed once approved).
      const results = Array.isArray(order.resolution_data?.results) ? order.resolution_data.results : [];
      const items = Array.isArray(order.parsed_data?.line_items) ? order.parsed_data.line_items : [];
      const lines = results.length
        ? results.map((r) => ({
            lineId: r.lineId,
            norm: normalizeName(r.emailProductName),
            itemNo: r.status === 'approved' ? String(r.match?.itemNo ?? '') : '',
          }))
        : items.map((it, i) => ({ lineId: String(i + 1), norm: normalizeName(it.description), itemNo: '' }));

      const consumed = new Set();
      const claimLine = (product) => {
        // Preferred: match by item number when the sheet row has one.
        if (hasItemNumber(product.itemNo)) {
          const wanted = product.itemNo.trim();
          const byItem = lines.find((l) => !consumed.has(l.lineId) && l.itemNo && l.itemNo === wanted);
          if (byItem) {
            consumed.add(byItem.lineId);
            matchedByItem.item += 1;
            return byItem;
          }
        }
        // Fallback: normalized product name within this order only.
        const norm = normalizeName(product.name);
        const byName = lines.find((l) => !consumed.has(l.lineId) && l.norm === norm);
        if (byName) {
          consumed.add(byName.lineId);
          matchedByItem.name += 1;
          return byName;
        }
        return null;
      };

      const set = {};
      for (const product of products) {
        try {
          const line = claimLine(product);
          if (!line) {
            summary.productsNotMatched += 1;
            unmatchedProducts.push({ ref, where: product.where, name: product.name });
            continue;
          }
          const comment = deriveComment({ red: product.red, itemPresent: hasItemNumber(product.itemNo) });
          set[`product_comments.${line.lineId}`] = comment;
          summary.productsMatched += 1;
          if (comment === 'Released') summary.released += 1;
          else if (comment === 'OS') summary.os += 1;
          else summary.na += 1;
        } catch (e) {
          summary.rowsFailed += 1;
          skippedRows.push({ where: product.where, reason: `unexpected error: ${e.message}` });
        }
      }

      if (Object.keys(set).length) {
        bulkOps.push({ updateOne: { filter: { _id: order._id }, update: { $set: set } } });
      }
    }

    // 3. Migration summary — always shown BEFORE any write.
    console.log('');
    console.log(`F4U comment migration — ${apply ? 'APPLY' : 'DRY RUN (no writes; pass --apply to run)'}`);
    console.log('──────────────────────────────────────────────');
    console.log(`Source files            ${sources.map((s) => path.basename(s)).join(', ')}`);
    console.log(`Orders in sheets        ${summary.ordersInSheets}`);
    console.log(`Orders found in DB      ${summary.ordersFound}`);
    console.log(`Orders not found        ${summary.ordersNotFound}`);
    console.log(`Product rows read       ${summary.productRows}`);
    console.log(`Products matched        ${summary.productsMatched} (${matchedByItem.item} by item number, ${matchedByItem.name} by name)`);
    console.log(`Products not matched    ${summary.productsNotMatched}`);
    console.log(`  Released              ${summary.released}`);
    console.log(`  OS                    ${summary.os}`);
    console.log(`  N/A                   ${summary.na}`);
    console.log(`Rows skipped            ${summary.rowsSkipped}`);
    console.log(`Rows failed             ${summary.rowsFailed}`);

    if (notFoundRefs.length) {
      console.log(`\nOrder refs not in DB (${notFoundRefs.length}): ${notFoundRefs.join(', ')}`);
    }
    if (unmatchedProducts.length) {
      console.log(`\nUnmatched products (${unmatchedProducts.length}):`);
      for (const u of unmatchedProducts.slice(0, 50)) console.log(`  ${u.ref} · ${u.name}  (${u.where})`);
      if (unmatchedProducts.length > 50) console.log(`  … and ${unmatchedProducts.length - 50} more`);
    }
    if (skippedRows.length) {
      console.log(`\nSkipped rows (${skippedRows.length}):`);
      for (const s of skippedRows.slice(0, 50)) console.log(`  ${s.where}: ${s.reason}`);
      if (skippedRows.length > 50) console.log(`  … and ${skippedRows.length - 50} more`);
    }

    // 4. Write only with explicit confirmation (--apply).
    if (apply) {
      if (bulkOps.length) {
        const res = await Order.bulkWrite(bulkOps, { ordered: false });
        summary.rowsUpdated = summary.productsMatched;
        console.log(`\nWrote comments to ${res.modifiedCount} orders (${summary.rowsUpdated} product comments).`);
      } else {
        console.log('\nNothing to write.');
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
});
