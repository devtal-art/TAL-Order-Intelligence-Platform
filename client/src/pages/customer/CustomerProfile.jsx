import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import ProfileHeader from '../../components/customer/ProfileHeader.jsx';
import CustomerFinancialSummary from '../../components/customer/CustomerFinancialSummary.jsx';
import CustomerPurchaseHistory from '../../components/customer/CustomerPurchaseHistory.jsx';
import CustomerTimeline from '../../components/customer/timeline/CustomerTimeline.jsx';
import CustomerInsightsList from '../../components/customer/insights/CustomerInsightsList.jsx';
import ProductAnalytics from '../../components/customer/analytics/ProductAnalytics.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../../components/SavedOrderLookup.jsx';
import { customerService } from '../../services/customer/customerService.js';
import { orderService } from '../../services/orderService.js';

// Customer Intelligence — Customer Profile.
// Phase 1 shipped financial summary, purchase history, and top products.
// Phase 2 adds: profile header (avatar + since/last-active/status badges),
// business insights, a visual order timeline, a richer sortable product
// analytics table, and the extended financial dashboard (yearly/monthly
// trend, highest/lowest order, revenue growth).
// Order detail viewing reuses the exact same modal/download path as the
// Order Processing Dashboard/Search pages (SavedOrderDetailModal) — no new
// order-viewing code, no risk of the two modules drifting out of sync.
export default function CustomerProfile() {
  const { name } = useParams();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    customerService
      .profile(name)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load this customer.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const openOrder = useCallback(async (ref) => {
    setViewBusyRef(ref);
    setError('');
    try {
      setViewOrder(await orderService.get(ref));
    } catch (e) {
      setError(e.message || `Could not open order ${ref}.`);
    } finally {
      setViewBusyRef('');
    }
  }, []);

  return (
    <CustomerLayout>
      <div className="screen active" id="s-customer-profile">
        <div className="dl-head">
          <Link className="dl-back" to="/customers">← Back to Customers</Link>
        </div>

        {error && <div className="sol-error">{error}</div>}

        {loading ? (
          <div className="dw-loading">Loading customer…</div>
        ) : !profile ? (
          <div className="dl-empty">Customer not found.</div>
        ) : (
          <>
            <ProfileHeader profile={profile} />

            <CustomerFinancialSummary
              financials={profile.financials}
              monthlyRevenue={profile.monthlyRevenue}
              currency={profile.currency}
            />

            <CustomerInsightsList customerName={profile.customerName} />

            <section className="ci-card" aria-label="Order timeline">
              <div className="ci-card-head">
                <h3>Order Timeline</h3>
              </div>
              <CustomerTimeline
                purchaseHistory={profile.purchaseHistory}
                currency={profile.currency}
                onOpenOrder={openOrder}
                openBusyRef={viewBusyRef}
              />
            </section>

            <ProductAnalytics topProducts={profile.topProducts} currency={profile.currency} />

            <CustomerPurchaseHistory profile={profile} onOpenOrder={openOrder} openBusyRef={viewBusyRef} />
          </>
        )}

        {viewOrder && (
          <SavedOrderDetailModal
            order={viewOrder}
            onClose={() => setViewOrder(null)}
            onDownload={() => downloadOrderExcel(viewOrder)}
            onSaved={(updated) => setViewOrder(updated)}
          />
        )}
      </div>
    </CustomerLayout>
  );
}
