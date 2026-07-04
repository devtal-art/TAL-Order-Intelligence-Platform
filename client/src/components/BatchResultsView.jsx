// Batch results screen — shown after ZIP has been generated and downloaded.
// Shows summary stats and a re-download button in case the browser prompt was missed.
import { useState } from 'react';

export default function BatchResultsView({ batchResult, batchStats, batchSession, uniqueResults = {}, onReset }) {
  const { zipBlob, orderCount } = batchResult;
  const { totalProducts, uniqueProducts, previouslyApproved } = batchStats;
  const [downloading, setDownloading] = useState(false);

  const reDownload = () => {
    if (!zipBlob || downloading) return;
    setDownloading(true);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Orders.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
      setDownloading(false);
    }, 10_000);
  };

  const stats = [
    { n: orderCount, l: 'Excel Files' },
    { n: totalProducts, l: 'Total Products' },
    { n: uniqueProducts, l: 'Unique Products' },
    { n: previouslyApproved, l: 'Auto-Approved' },
  ];

  return (
    <div className="screen active" id="s-batch-results">
      {/* Success header */}
      <div className="res-top">
        <div className="chk">
          <svg viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2>Batch Complete</h2>
        <p>{orderCount} Excel file{orderCount !== 1 ? 's' : ''} packed into <strong>Orders.zip</strong></p>
      </div>

      {/* Stats */}
      <div className="stats">
        {stats.map((s, i) => (
          <div className="sc" key={i}>
            <div className="sc-n">{s.n}</div>
            <div className="sc-l">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ZIP download card */}
      <div className="dl-card">
        <svg viewBox="0 0 24 24" style={{ width: '36px', height: '36px', fill: 'none', stroke: '#16A34A', strokeWidth: 1.8, strokeLinecap: 'round', flexShrink: 0 }}>
          {/* Zip/archive icon */}
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9 15 12 18 15 15" />
        </svg>
        <div className="dl-mid">
          <div className="dl-fname">Orders.zip</div>
          <div className="dl-meta">
            {orderCount} Excel workbook{orderCount !== 1 ? 's' : ''} · 5 sheets each · Downloaded automatically
          </div>
        </div>
        <button className="btn-dl" onClick={reDownload} disabled={downloading}>
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {downloading ? 'Downloading…' : 'Download Again'}
        </button>
      </div>

      {/* Per-order preview list */}
      <div className="prev-hdr">
        Orders in this batch
        <span className="mtag">{orderCount} files</span>
      </div>
      <div className="tbl-wrap">
        <table className="ptbl">
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Portal Order Ref</th>
              <th>Filename</th>
              <th className="nr">Items</th>
              <th className="nr">Approved</th>
              <th className="nr">Needs Review</th>
            </tr>
          </thead>
          <tbody>
            {batchSession.orders.map((order, i) => {
              const inf = order.parsedData.order_info || {};
              const approved = order.products.filter((p) => uniqueResults[p.uniqueKey]?.status === 'approved').length;
              const needs = order.products.length - approved;
              return (
                <tr key={i}>
                  <td style={{ color: '#94A3B8', fontSize: '11px' }}>{i + 1}</td>
                  <td style={{ color: '#0F172A', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
                    {inf.order_ref || '—'}
                  </td>
                  <td title={order.filename} style={{ fontSize: '12px' }}>{order.filename}</td>
                  <td className="nr">{order.products.length}</td>
                  <td className="nr" style={{ color: approved ? '#15803D' : '#94A3B8' }}>{approved}</td>
                  <td className="nr" style={{ color: needs ? '#B45309' : '#94A3B8' }}>{needs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button className="btn-rst" onClick={onReset}>
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Process another batch
        </button>
      </div>
    </div>
  );
}
