import * as XLSX from 'xlsx';
import { currencySymbol } from '../utils/format.js';
import { portalOrderRef } from '../utils/order.js';

// Results screen (s-results). Same values, filename and download options as the
// original showResults(); the workbook is passed in from the processing flow.
// V1.2: shows the order identity (Portal Order Ref) and resolution counts.
export default function ResultsView({ data, workbook, resolution, comments = {}, filename = '', onReset }) {
  const d = data;
  const fin = d.financials || {};
  const inf = d.order_info || {};
  const items = d.line_items || [];
  const sym = currencySymbol(fin.currency);
  const fname = `Order_${inf.order_ref || 'Extract'}_${(inf.order_date || '').replace(/\//g, '-') || 'data'}.xlsx`;

  const orderRef = portalOrderRef(d, filename);
  const resResults = resolution?.results || [];
  const approvedCount = resResults.filter((r) => r.status === 'approved').length;
  const needsCount = resResults.filter((r) => r.status === 'needs_review').length;

  // Calculate updated totals using the new logic
  const subTotal = Number(fin.sub_total) || 0;
  const transport = Number(fin.transportation_charges) || 0;
  const total = Number(fin.total) || 0;

  let totalAdjustment = 0;
  resResults.forEach((r) => {
    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && items[lineIndex]) || null;
    if (!item) return;

    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const itemTotal = qty * Math.abs(unitPrice);
    const comment = comments[r.lineId] || '';
    const isNotFound = comment === 'Not Found';
    const isManual = r.source === 'manual_addition';

    if (isNotFound) {
      totalAdjustment -= itemTotal;
    } else if (isManual) {
      if (unitPrice < 0) {
        totalAdjustment -= itemTotal;
      } else {
        totalAdjustment += itemTotal;
      }
    }
  });

  const updatedSub = subTotal + totalAdjustment;
  const updatedTot = total + totalAdjustment;

  const stats = [
    { n: items.length, l: 'Line items' },
    { n: `${updatedTot < 0 ? '-' : ''}${sym}${Math.abs(updatedTot).toFixed(2)}`, l: 'Order total' },
    { n: inf.order_ref || '—', l: 'Order ref' },
    { n: (d.billing_address?.company_name || '—').split(' ').slice(0, 2).join(' ') || '—', l: 'Customer' },
  ];

  const prev = items.slice(0, 6);

  const download = () => XLSX.writeFile(workbook, fname, { bookType: 'xlsx', type: 'binary', cellStyles: true });

  return (
    <div className="screen active" id="s-results">
      <div className="res-top">
        <div className="chk">
          <svg viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2>Your Excel file is ready</h2>
        <p>{`${items.length} line items · ${updatedTot < 0 ? '-' : ''}${sym}${Math.abs(updatedTot).toFixed(2)} total · 5 Excel sheets`}</p>
      </div>

      <div className="ord-id-card">
        <div className="ord-id-main">
          <span className="ord-id-label">Portal Order Ref</span>
          <span className="ord-id-ref">{orderRef}</span>
          <span className="ord-id-file" title={filename}>{filename || fname}</span>
        </div>
        <div className="ord-id-counts">
          <span className="ord-id-count">{items.length} products</span>
          {approvedCount > 0 && <span className="ord-id-count approved">{approvedCount} approved</span>}
          {needsCount > 0 && <span className="ord-id-count needs">{needsCount} needs review</span>}
        </div>
      </div>

      <div className="stats">
        {stats.map((s, i) => (
          <div className="sc" key={i}>
            <div className="sc-n">{s.n}</div>
            <div className="sc-l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="dl-card">
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M8 13h8M8 17h5" />
        </svg>
        <div className="dl-mid">
          <div className="dl-fname">{fname}</div>
          <div className="dl-meta">5 sheets · Order Summary · Addresses · Line Items · Financial Summary · Resolution</div>
        </div>
        <button className="btn-dl" onClick={download}>
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>
      </div>

      <div className="prev-hdr">
        Line items preview{' '}
        <span className="mtag">{items.length > 6 ? `+${items.length - 6} more in Excel` : `${items.length} items total`}</span>
      </div>
      <div className="tbl-wrap">
        <table className="ptbl">
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '36px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Product description</th>
              <th>Package</th>
              <th>Qty</th>
              <th className="nr">Unit price</th>
              <th className="nr">Total</th>
            </tr>
          </thead>
          <tbody>
            {prev.map((it, i) => {
              const isUnitPriceNegative = Number(it.unit_price) < 0;
              const isTotalNegative = Number(it.total) < 0;
              return (
                <tr key={i}>
                  <td style={{ color: '#A8A29E', fontSize: '11px' }}>{i + 1}</td>
                  <td title={it.description || ''}>{it.description || ''}</td>
                  <td style={{ color: '#78716C', fontSize: '11px' }}>{it.package || ''}</td>
                  <td className="nr">{it.qty || 0}</td>
                  <td className={`nr${isUnitPriceNegative ? ' price-negative' : ''}`}>
                    {isUnitPriceNegative ? '-' : ''}{sym}{Math.abs(Number(it.unit_price || 0)).toFixed(2)}
                  </td>
                  <td className={`nr${isTotalNegative ? ' price-negative' : ''}`} style={{ fontWeight: 600 }}>
                    {isTotalNegative ? '-' : ''}{sym}{Math.abs(Number(it.total || 0)).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="tot-strip">
          <div className="ti">
            Sub total{' '}
            <strong>
              {updatedSub < 0 ? '-' : ''}{sym}{Math.abs(updatedSub).toFixed(2)}
            </strong>
          </div>
          <div className="ti">
            Discount{' '}
            <strong>
              {Number(fin.discount) < 0 ? '-' : ''}{sym}{Math.abs(fin.discount || 0).toFixed(2)}
            </strong>
          </div>
          <div className="ti">
            Total{' '}
            <strong style={{ color: '#067647' }}>
              {updatedTot < 0 ? '-' : ''}{sym}{Math.abs(updatedTot).toFixed(2)}
            </strong>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button className="btn-rst" onClick={onReset}>
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Process another file
        </button>
      </div>
    </div>
  );
}
