import { currencySymbol } from '../../utils/format.js';
import StatCard from './analytics/StatCard.jsx';

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Whole days from the viewer's today (local midnight) to `iso`'s day.
function daysFromToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

// Order Rhythm caption: "Next expected: 25 Nov 2026" plus "· Overdue by: N
// days" once that date has passed (server sends the dates; today is local).
function rhythmCaption(r) {
  if (!r) return 'Needs orders on at least 2 different dates.';
  const overdue = -daysFromToday(r.nextExpectedDate);
  const next = `Next expected: ${fmtDate(r.nextExpectedDate)}`;
  return overdue > 0 ? `${next} · Overdue by: ${overdue} day${overdue === 1 ? '' : 's'}` : next;
}

// Customer profile stat tiles (the row under the profile header).
// Ordered / Invoiced / Pending / Lost / Fulfilment Rate come from
// `profile.fulfilment` (same definitions as the Fulfilment tab and the
// Analytics Dashboard); order counts and values from `profile.financials`;
// Order Rhythm from `profile.orderRhythm`.
export default function CustomerFinancialSummary({ profile }) {
  const { financials, fulfilment: f, orderRhythm: r, currency } = profile;
  const sym = currencySymbol(currency);
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tiles = [
    { key: 'ordered', label: 'Ordered Value', value: money(f.orderedValue), hint: 'Total value of every order this customer placed' },
    { key: 'invoiced', label: 'Invoiced Value', value: money(f.invoicedValue), caption: `${f.invoicedOrders} Lit Invoice order${f.invoicedOrders === 1 ? '' : 's'}`, hint: 'Amount billed on Lit Invoice orders' },
    { key: 'pending', label: 'Pending Value', value: money(f.pendingValue), caption: `${f.osLines.length} OS line${f.osLines.length === 1 ? '' : 's'}`, hint: 'Value of OS products still to be delivered' },
    { key: 'lost', label: 'Lost Value', value: money(f.lostValue), caption: `${f.notFoundLines.length} Not Found line${f.notFoundLines.length === 1 ? '' : 's'} · ${f.cancelledOrders.length} cancelled order${f.cancelledOrders.length === 1 ? '' : 's'}`, hint: 'Value of Not Found products + cancelled orders' },
    { key: 'rate', label: 'Fulfilment Rate', value: f.fulfilmentRatePct === null ? '—' : `${Number(f.fulfilmentRatePct).toFixed(2)}%`, hint: 'Share of Ordered Value that has been invoiced' },
    { key: 'orders', label: 'Total Orders', value: String(financials.orderCount), hint: 'Number of orders this customer placed' },
    { key: 'avg', label: 'Avg Order Value', value: money(financials.avgOrderValue), hint: 'Ordered Value ÷ Total Orders' },
    { key: 'highest', label: 'Highest Order', value: financials.highestOrder ? money(financials.highestOrder.total) : '—', caption: financials.highestOrder ? `Order #${financials.highestOrder.portalOrderRef}` : null, hint: 'Largest single order by value' },
    { key: 'lowest', label: 'Lowest Order', value: financials.lowestOrder ? money(financials.lowestOrder.total) : '—', caption: financials.lowestOrder ? `Order #${financials.lowestOrder.portalOrderRef}` : null, hint: `Smallest single order by value (${sym}0 orders ignored)` },
    { key: 'rhythm', label: 'Order Rhythm', value: r ? `~${r.avgGapDays} day${r.avgGapDays === 1 ? '' : 's'}` : '—', caption: rhythmCaption(r), hint: 'Average days between this customer’s order dates' },
  ];

  return (
    <div className="ci-stat-row ci-stat-row--profile" aria-label="Customer financial summary">
      {tiles.map((t) => (
        <StatCard key={t.key} label={t.label} value={t.value} caption={t.caption} hint={t.hint} />
      ))}
    </div>
  );
}
