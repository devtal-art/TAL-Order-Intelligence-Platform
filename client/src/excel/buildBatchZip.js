// ──────────────────────────────────────────────────────────────────────────────
//  BATCH ZIP BUILDER  (V1.1 — new file)
//
//  Calls the existing buildXLSX (unchanged) for every order, then packages
//  all resulting workbooks into a single Orders.zip using JSZip.
//
//  buildXLSX is the ONLY Excel-generation function used — nothing is changed
//  in it. We only orchestrate calling it N times and zipping the outputs.
// ──────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { buildXLSX } from './buildXLSX.js';

/**
 * Build a ZIP containing one Excel file per order, then trigger a download.
 *
 * @param {Array} orderOutputs — each element:
 *   { filename: string, parsedData: object, resolution: object }
 *
 * @returns {{ zipBlob: Blob, orderCount: number }}
 */
export async function buildBatchZip(orderOutputs) {
  const zip = new JSZip();

  const usedNames = new Map(); // track duplicate order refs for de-collision

  for (const { filename, parsedData, resolution } of orderOutputs) {
    // Build the workbook via the unchanged Excel builder
    const workbook = buildXLSX(parsedData, resolution);

    // Determine a safe Excel filename
    const inf = parsedData.order_info || {};
    const orderRef = inf.order_ref || filename.replace(/\.html?$/i, '') || 'Order';
    const dateStr = (inf.order_date || '').replace(/\//g, '-') || 'data';
    let baseName = `Order_${orderRef}_${dateStr}`;

    // De-collide if two orders share the same ref
    const count = usedNames.get(baseName) || 0;
    usedNames.set(baseName, count + 1);
    const xlsxName = count === 0 ? `${baseName}.xlsx` : `${baseName}_${count + 1}.xlsx`;

    // Serialise workbook to a Uint8Array (binary)
    const uint8 = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
    zip.file(xlsxName, uint8, { binary: false }); // JSZip accepts Uint8Array directly
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  // Trigger the browser download automatically
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Orders.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { zipBlob, orderCount: orderOutputs.length };
}
