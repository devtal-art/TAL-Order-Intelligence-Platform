import path from 'path';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { connectDB } from '../src/config/db.js';
import { ApprovedMapping } from '../src/models/approvedMapping.model.js';
import { Product } from '../src/models/product.model.js';
import { normalizeName } from '../src/utils/normalizeName.js';

// Synchronizes the bulk-imported rows of the ApprovedMapping collection with a
// corrected "Approved Products" sheet, which is treated as the single source of
// truth for bulk-approved mappings.
//
// Scope — only documents with approved_by === 'bulk_import' are ever modified:
//   - sheet row not yet mapped            → insert (approved_by: 'bulk_import')
//   - bulk_import mapping differs         → update in place (approved_date and
//                                           times_used are preserved)
//   - bulk_import mapping not in sheet    → delete (obsolete previous import)
//   - mapping approved via Manual Approval → NEVER touched; a sheet row whose
//                                           name collides with one is skipped
//                                           and reported.
// Deletes are hard deletes: normalized_email_name is unique regardless of
// status, so a retired leftover would block re-approving the same name.
//
// Sheet layout (first worksheet): one column holds the Item Number, the other
// the Product Name as it appears in order emails. Column order is detected
// from the header row, so both historical layouts are accepted. Catalog
// matching is by Item Number ONLY — names are never compared.
//
// Validation runs before any write. Two item numbers are known to appear twice
// on purpose (two distinct email names for the same product) and are not
// errors; any OTHER duplicate item number, duplicate name, or conflicting
// mapping is reported and the offending rows are excluded from the sync.
//
// Usage:
//   node scripts/sync-approved-products.js "<path to approved products.xlsx>"            (dry run)
//   node scripts/sync-approved-products.js "<path to approved products.xlsx>" --apply    (write)
//
// The sync is idempotent: re-running with the same sheet is a no-op.

const APPROVED_BY = 'bulk_import';

// Item numbers that legitimately appear on two rows (two email names for the
// same catalog product). The unique key of a mapping is the normalized email
// name, so these coexist without conflict.
const INTENTIONAL_DUPLICATE_ITEM_NOS = new Set(['71476', '71478']);

// exceljs cell values can be strings, numbers, rich text, formula results…
// Reduce any of them to a plain trimmed string.
function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim();
    if (value.result !== undefined) return String(value.result).trim();
    if (value.text !== undefined) return String(value.text).trim();
    return String(value).trim();
  }
  return String(value).trim();
}

// The two layouts seen so far: "Product Name | Item Number" (original import)
// and "Item Number | Product name on email" (corrected sheet). Decide from the
// header which column is which; without a header, the mostly-numeric column is
// the item number.
function detectColumns(sheet) {
  const first = sheet.getRow(1);
  const a = cellToString(first.getCell(1).value);
  const b = cellToString(first.getCell(2).value);
  if (/item\s*(no|number)/i.test(a) || /product/i.test(b)) return { itemCol: 1, nameCol: 2, headerRows: 1 };
  if (/product/i.test(a) || /item\s*(no|number)/i.test(b)) return { itemCol: 2, nameCol: 1, headerRows: 1 };

  let numericA = 0;
  let numericB = 0;
  let sampled = 0;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (sampled >= 20) return;
    sampled += 1;
    if (/^\d+$/.test(cellToString(row.getCell(1).value))) numericA += 1;
    if (/^\d+$/.test(cellToString(row.getCell(2).value))) numericB += 1;
  });
  return numericA >= numericB ? { itemCol: 1, nameCol: 2, headerRows: 0 } : { itemCol: 2, nameCol: 1, headerRows: 0 };
}

function printSection(title) {
  console.log('');
  console.log(title);
  console.log('─'.repeat(title.length));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileArg = args.find((a) => a !== '--apply');
  if (!fileArg) {
    console.error('Usage: node scripts/sync-approved-products.js "<path to approved products .xlsx>" [--apply]');
    process.exit(1);
  }
  const filePath = path.resolve(fileArg);

  // ── 1. Read the sheet ──
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    console.error('The workbook contains no worksheets.');
    process.exit(1);
  }
  const { itemCol, nameCol, headerRows } = detectColumns(sheet);

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRows) return;
    const itemNo = cellToString(row.getCell(itemCol).value);
    const name = cellToString(row.getCell(nameCol).value);
    rows.push({ rowNumber, itemNo, name, norm: normalizeName(name) });
  });

  // ── 2. Validate — no DB access needed for in-file checks ──
  const invalidRows = [];
  const validRows = [];
  for (const row of rows) {
    if (!row.name || !row.itemNo) {
      invalidRows.push({ row: row.rowNumber, reason: 'missing product name or item number' });
    } else {
      validRows.push(row);
    }
  }

  const byNorm = new Map();
  const byItemNo = new Map();
  for (const row of validRows) {
    if (!byNorm.has(row.norm)) byNorm.set(row.norm, []);
    byNorm.get(row.norm).push(row);
    if (!byItemNo.has(row.itemNo)) byItemNo.set(row.itemNo, []);
    byItemNo.get(row.itemNo).push(row);
  }

  // Same normalized name twice: identical item → redundant row (keep first);
  // different items → genuinely conflicting mapping (exclude the whole group,
  // the sheet must be fixed — we cannot guess which item is right).
  const redundantRows = [];
  const conflictingNames = [];
  const excludedNorms = new Set();
  for (const [norm, group] of byNorm) {
    if (group.length === 1) continue;
    const items = new Set(group.map((r) => r.itemNo));
    if (items.size === 1) {
      redundantRows.push(...group.slice(1).map((r) => ({ row: r.rowNumber, name: r.name, itemNo: r.itemNo })));
    } else {
      conflictingNames.push({ norm, rows: group.map((r) => ({ row: r.rowNumber, itemNo: r.itemNo })) });
      excludedNorms.add(norm);
    }
  }

  // Same item number on several rows is DB-valid (many email names → one
  // product) but, per the corrected sheet's rules, only the two known cases
  // are intentional; anything else is a data-quality error to report.
  const ignoredDuplicateItems = [];
  const unexpectedDuplicateItems = [];
  for (const [itemNo, group] of byItemNo) {
    if (group.length === 1) continue;
    const entry = { itemNo, rows: group.map((r) => ({ row: r.rowNumber, name: r.name })) };
    if (INTENTIONAL_DUPLICATE_ITEM_NOS.has(itemNo)) {
      ignoredDuplicateItems.push(entry);
    } else {
      unexpectedDuplicateItems.push(entry);
      for (const r of group.slice(1)) excludedNorms.add(r.norm); // keep the first, exclude the rest
    }
  }

  // Desired state: normalized name → row. Redundant rows collapse here
  // because the map keeps the first occurrence.
  const desired = new Map();
  for (const row of validRows) {
    if (excludedNorms.has(row.norm)) continue;
    if (!desired.has(row.norm)) desired.set(row.norm, row);
  }

  await connectDB();
  const summary = {
    totalRows: rows.length,
    imported: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    skipped: invalidRows.length + redundantRows.length,
    itemNotFound: 0,
    manualConflicts: 0,
  };

  try {
    // ── 3. Resolve item numbers against the active catalog ──
    const itemNos = [...new Set([...desired.values()].map((r) => r.itemNo))];
    const catalogProducts = await Product.find({ item_no: { $in: itemNos } }, { item_no: 1, name: 1, _id: 0 }).lean();
    const catalogByItemNo = new Map(catalogProducts.map((p) => [p.item_no, p]));

    const notFoundRows = [];
    for (const [norm, row] of desired) {
      if (!catalogByItemNo.has(row.itemNo)) {
        notFoundRows.push({ row: row.rowNumber, itemNo: row.itemNo, name: row.name });
        desired.delete(norm);
      }
    }
    summary.itemNotFound = notFoundRows.length;

    // ── 4. Diff desired state against the collection ──
    const existing = await ApprovedMapping.find({}).lean();
    const manualByNorm = new Map();
    const bulkByNorm = new Map();
    for (const doc of existing) {
      (doc.approved_by === APPROVED_BY ? bulkByNorm : manualByNorm).set(doc.normalized_email_name, doc);
    }

    const toInsert = [];
    const toUpdate = [];
    const toDelete = [];
    const manualConflicts = [];

    for (const [norm, row] of desired) {
      const product = catalogByItemNo.get(row.itemNo);

      const manual = manualByNorm.get(norm);
      if (manual) {
        // Manual Approval owns this name. Only worth flagging when the sheet
        // disagrees with what the user approved.
        if (manual.item_no !== row.itemNo) {
          manualConflicts.push({ row: row.rowNumber, name: row.name, sheetItemNo: row.itemNo, manualItemNo: manual.item_no });
        }
        continue;
      }

      const bulk = bulkByNorm.get(norm);
      if (!bulk) {
        toInsert.push({
          email_product_name: row.name,
          normalized_email_name: norm,
          website_product_name: product.name,
          item_no: row.itemNo,
          approved_by: APPROVED_BY,
        });
      } else if (bulk.item_no !== row.itemNo || bulk.website_product_name !== product.name || bulk.email_product_name !== row.name) {
        toUpdate.push({
          _id: bulk._id,
          set: { email_product_name: row.name, website_product_name: product.name, item_no: row.itemNo, status: 'active' },
        });
      } else {
        summary.unchanged += 1;
      }
    }

    for (const [norm, doc] of bulkByNorm) {
      if (!desired.has(norm)) toDelete.push(doc);
    }

    summary.manualConflicts = manualConflicts.length;

    // ── 5. Validation report — printed before any write ──
    printSection('Validation report');
    console.log(`Sheet                        ${path.basename(filePath)} (worksheet "${sheet.name}")`);
    console.log(`Total data rows              ${rows.length}`);
    console.log(`Invalid rows                 ${invalidRows.length}`);
    console.log(`Duplicate item numbers       ${unexpectedDuplicateItems.length} unexpected, ${ignoredDuplicateItems.length} intentional (ignored)`);
    console.log(`Duplicate product names      ${conflictingNames.length} conflicting, ${redundantRows.length} redundant (same mapping twice)`);
    console.log(`Item numbers not in catalog  ${notFoundRows.length}`);
    console.log(`Manual-approval conflicts    ${manualConflicts.length}`);

    for (const d of ignoredDuplicateItems) {
      console.log(`  intentional duplicate item_no ${d.itemNo}:`);
      for (const r of d.rows) console.log(`    row ${r.row}: ${r.name}`);
    }
    for (const d of unexpectedDuplicateItems) {
      console.log(`  UNEXPECTED duplicate item_no ${d.itemNo} (only the first row is kept):`);
      for (const r of d.rows) console.log(`    row ${r.row}: ${r.name}`);
    }
    for (const c of conflictingNames) {
      console.log(`  CONFLICT: "${c.norm}" maps to several items — all rows excluded:`);
      for (const r of c.rows) console.log(`    row ${r.row}: item_no ${r.itemNo}`);
    }
    for (const r of invalidRows) console.log(`  invalid row ${r.row}: ${r.reason}`);
    for (const r of redundantRows) console.log(`  redundant row ${r.row}: duplicate of an earlier identical row (${r.itemNo})`);
    for (const r of notFoundRows) console.log(`  row ${r.row}: item_no "${r.itemNo}" not in catalog — ${r.name}`);
    for (const c of manualConflicts) {
      console.log(`  row ${c.row}: "${c.name}" — sheet says ${c.sheetItemNo}, Manual Approval says ${c.manualItemNo}; manual mapping preserved`);
    }

    printSection(apply ? 'Applying changes' : 'Planned changes (dry run — pass --apply to write)');
    console.log(`Insert     ${toInsert.length}`);
    console.log(`Update     ${toUpdate.length}`);
    console.log(`Remove     ${toDelete.length} (obsolete bulk-import mappings)`);
    console.log(`Unchanged  ${summary.unchanged}`);
    for (const m of toInsert) console.log(`  + ${m.item_no}  ${m.email_product_name}`);
    for (const u of toUpdate) console.log(`  ~ ${u.set.item_no}  ${u.set.email_product_name}`);
    for (const d of toDelete) console.log(`  - ${d.item_no}  ${d.email_product_name}`);

    // ── 6. Write ──
    if (apply) {
      if (toDelete.length) {
        const res = await ApprovedMapping.deleteMany({
          _id: { $in: toDelete.map((d) => d._id) },
          approved_by: APPROVED_BY, // belt and braces: never delete a manual approval
        });
        summary.removed = res.deletedCount;
      }
      if (toUpdate.length) {
        const res = await ApprovedMapping.bulkWrite(
          toUpdate.map((u) => ({ updateOne: { filter: { _id: u._id, approved_by: APPROVED_BY }, update: { $set: u.set } } })),
          { ordered: false }
        );
        summary.updated = res.modifiedCount;
      }
      if (toInsert.length) {
        try {
          const inserted = await ApprovedMapping.insertMany(toInsert, { ordered: false });
          summary.imported = inserted.length;
        } catch (e) {
          // E11000 = created concurrently since the diff was computed.
          const writeErrors = e?.writeErrors ?? [];
          const dupes = writeErrors.filter((we) => we.err?.code === 11000 || we.code === 11000).length;
          if (!writeErrors.length || dupes !== writeErrors.length) throw e;
          summary.imported = toInsert.length - dupes;
          summary.unchanged += dupes;
        }
      }

      const remaining = await ApprovedMapping.countDocuments({ approved_by: APPROVED_BY });
      printSection('Sync summary');
      console.log(`Total rows processed   ${summary.totalRows}`);
      console.log(`Imported               ${summary.imported}`);
      console.log(`Updated                ${summary.updated}`);
      console.log(`Removed                ${summary.removed}`);
      console.log(`Unchanged              ${summary.unchanged}`);
      console.log(`Skipped                ${summary.skipped} (invalid or redundant rows)`);
      console.log(`Item not in catalog    ${summary.itemNotFound}`);
      console.log(`Manual conflicts       ${summary.manualConflicts} (manual mappings preserved)`);
      console.log(`bulk_import mappings now in DB: ${remaining} (expected ${desired.size - [...desired.keys()].filter((n) => manualByNorm.has(n)).length})`);
    } else {
      console.log('\nDry run only — no database changes were made.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exitCode = 1;
});
