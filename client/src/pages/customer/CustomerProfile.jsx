import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout.jsx';
import ProfileHeader from '../../components/customer/ProfileHeader.jsx';
import CustomerFinancialSummary from '../../components/customer/CustomerFinancialSummary.jsx';
import CustomerPurchaseHistory from '../../components/customer/CustomerPurchaseHistory.jsx';
import CustomerTimeline from '../../components/customer/timeline/CustomerTimeline.jsx';
import ProductAnalytics from '../../components/customer/analytics/ProductAnalytics.jsx';
import ProfileOverviewTab from '../../components/customer/profile/ProfileOverviewTab.jsx';
import ProfileFulfilmentTab from '../../components/customer/profile/ProfileFulfilmentTab.jsx';
import ProfileFinanceTab from '../../components/customer/profile/ProfileFinanceTab.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../../components/SavedOrderLookup.jsx';
import { customerService } from '../../services/customer/customerService.js';
import { orderService } from '../../services/orderService.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'orders', label: 'Orders' },
  { key: 'products', label: 'Products' },
  { key: 'fulfilment', label: 'Fulfilment' },
  { key: 'finance', label: 'Finance' },
];

// Customer Intelligence — Customer Profile.
// Layout: profile header and stat tiles always on top; everything else is
// split into tabs (Overview / Orders / Products / Fulfilment / Finance).
// The active tab lives in the URL (?tab=…), so a refresh or a shared link
// keeps it.
// Order detail viewing reuses the exact same modal/download path as the
// Order Processing Dashboard/Search pages (SavedOrderDetailModal) — no new
// order-viewing code, no risk of the two modules drifting out of sync.
export default function CustomerProfile() {
  const { name } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview';

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

  const goToTab = useCallback(
    (key) => {
      const next = new URLSearchParams(params);
      if (key === 'overview') next.delete('tab');
      else next.set('tab', key);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(e) {
    const i = TABS.findIndex((t) => t.key === tab);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    if (j === null) return;
    e.preventDefault();
    goToTab(TABS[j].key);
    document.getElementById(`cp-tab-${TABS[j].key}`)?.focus();
  }

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

            <CustomerFinancialSummary profile={profile} />

            <div className="ci-profile-tabs" role="tablist" aria-label="Customer profile sections" onKeyDown={onTabKeyDown}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  id={`cp-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls="cp-tabpanel"
                  tabIndex={tab === t.key ? 0 : -1}
                  className={`ci-profile-tab${tab === t.key ? ' active' : ''}`}
                  onClick={() => goToTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div id="cp-tabpanel" role="tabpanel" aria-labelledby={`cp-tab-${tab}`} className="ci-profile-tabpanel">
              {tab === 'overview' && (
                <ProfileOverviewTab profile={profile} onOpenOrder={openOrder} openBusyRef={viewBusyRef} goToTab={goToTab} />
              )}

              {tab === 'orders' && (
                <div className="ci-profile-grid">
                  <CustomerPurchaseHistory profile={profile} onOpenOrder={openOrder} openBusyRef={viewBusyRef} />
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
                </div>
              )}

              {tab === 'products' && <ProductAnalytics topProducts={profile.topProducts} currency={profile.currency} />}

              {tab === 'fulfilment' && (
                <ProfileFulfilmentTab profile={profile} onOpenOrder={openOrder} openBusyRef={viewBusyRef} />
              )}

              {tab === 'finance' && <ProfileFinanceTab profile={profile} />}
            </div>
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
