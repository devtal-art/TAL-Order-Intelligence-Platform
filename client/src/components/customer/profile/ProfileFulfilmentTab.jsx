import { currencySymbol } from '../../../utils/format.js';
import StatCard from '../analytics/StatCard.jsx';

// Fulfilment tab: this customer's Invoiced / Lost / Pending value and
// Fulfilment Rate. The definitions match the Analytics Dashboard tiles, and
// the server computes them in getCustomerProfile (`profile.fulfilment`).
// Below the tiles are the lines and orders behind Pending and Lost.
export default function ProfileFulfilmentTab({ profile, onOpenOrder, openBusyRef }) {
  const f = profile.fulfilment;
  const sym = currencySymbol(profile.currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tiles = [
    { key: 'invoiced', label: 'Invoiced Value', value: money(f.invoicedValue), caption: `Sum of the Lit Invoice amount of ${f.invoicedOrders} Lit Invoice order${f.invoicedOrders === 1 ? '' : 's'}.` },
    { key: 'lost', label: 'Lost Value', value: money(f.lostValue), caption: "Not Found products (QTY × price) + cancelled orders' products (QTY × price)." },
    { key: 'pending', label: 'Pending Value', value: money(f.pendingValue), caption: 'OS products: Pending Qty × price (full QTY if none entered). Excludes cancelled orders.' },
    { key: 'rate', label: 'Fulfilment Rate', value: f.fulfilmentRatePct === null ? '—' : `${Number(f.fulfilmentRatePct).toFixed(2)}%`, caption: 'Invoiced Value ÷ Lifetime Revenue × 100.' },
  ];

  const viewBtn = (ref) => (
    <td className="dl-act">
      <button className="dw-view" type="button" onClick={() => onOpenOrder(ref)} disabled={openBusyRef === ref}>
        {openBusyRef === ref ? '…' : 'View'}
      </button>
    </td>
  );

  return (
    <div className="ci-profile-grid">
      <div className="ci-stat-row ci-stat-row--tab" aria-label="Fulfilment summary">
        {tiles.map((t) => (
          <StatCard key={t.key} label={t.label} value={t.value} caption={t.caption} />
        ))}
      </div>

      <section className="ci-card" aria-label="Pending products">
        <div className="ci-card-head">
          <h3>Pending Products (OS)</h3>
          <span className="ci-card-sub">{f.osLines.length} line{f.osLines.length === 1 ? '' : 's'} · {money(f.pendingValue)}</span>
        </div>
        {f.osLines.length === 0 ? (
          <div className="dl-empty">No products are marked OS for this customer.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Order Date</th>
                  <th>Product</th>
                  <th className="dl-num">Ordered Qty</th>
                  <th className="dl-num">Pending Qty</th>
                  <th className="dl-num">Unit Price</th>
                  <th className="dl-num">Pending Value</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {f.osLines.map((l, i) => (
                  <tr key={`${l.portalOrderRef}-${i}`}>
                    <td className="dl-ref">{l.portalOrderRef}</td>
                    <td>{l.orderDate || <span className="dl-muted">—</span>}</td>
                    <td>{l.product}</td>
                    <td className="dl-num">{l.qty}</td>
                    <td className="dl-num">{l.pendingQty}</td>
                    <td className="dl-num">{money(l.unitPrice)}</td>
                    <td className="dl-num">{money(l.value)}</td>
                    {viewBtn(l.portalOrderRef)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ci-card" aria-label="Not found products">
        <div className="ci-card-head">
          <h3>Not Found Products</h3>
          <span className="ci-card-sub">{f.notFoundLines.length} line{f.notFoundLines.length === 1 ? '' : 's'}</span>
        </div>
        {f.notFoundLines.length === 0 ? (
          <div className="dl-empty">No products are marked Not Found for this customer.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Order Date</th>
                  <th>Product</th>
                  <th className="dl-num">Qty</th>
                  <th className="dl-num">Unit Price</th>
                  <th className="dl-num">Lost Value</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {f.notFoundLines.map((l, i) => (
                  <tr key={`${l.portalOrderRef}-${i}`}>
                    <td className="dl-ref">{l.portalOrderRef}</td>
                    <td>{l.orderDate || <span className="dl-muted">—</span>}</td>
                    <td>{l.product}</td>
                    <td className="dl-num">{l.qty}</td>
                    <td className="dl-num">{money(l.unitPrice)}</td>
                    <td className="dl-num">{money(l.value)}</td>
                    {viewBtn(l.portalOrderRef)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ci-card" aria-label="Cancelled orders">
        <div className="ci-card-head">
          <h3>Cancelled Orders</h3>
          <span className="ci-card-sub">{f.cancelledOrders.length} order{f.cancelledOrders.length === 1 ? '' : 's'}</span>
        </div>
        {f.cancelledOrders.length === 0 ? (
          <div className="dl-empty">No cancelled orders for this customer.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Order Date</th>
                  <th className="dl-num">Products</th>
                  <th className="dl-num">Lost Value</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {f.cancelledOrders.map((o) => (
                  <tr key={o.portalOrderRef}>
                    <td className="dl-ref">{o.portalOrderRef}</td>
                    <td>{o.orderDate || <span className="dl-muted">—</span>}</td>
                    <td className="dl-num">{o.products}</td>
                    <td className="dl-num">{money(o.value)}</td>
                    {viewBtn(o.portalOrderRef)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
