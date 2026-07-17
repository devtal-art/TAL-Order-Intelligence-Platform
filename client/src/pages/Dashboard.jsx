import { useCallback, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import DashboardWidgets from '../components/DashboardWidgets.jsx';
import { orderService } from '../services/orderService.js';

// Dashboard page (V2.3). Purely the operational widgets — Order Status and
// Comments buckets side by side. Saved-order search lives on its own Search
// page (/search).
//
// Dynamic behaviour: `refreshToken` is bumped after ANY order edit saved from
// this page's View modal, which re-fetches the widget data — an order whose
// delivery status changed from Delivered to Half Delivered moves card
// immediately, no manual refresh.
export default function Dashboard() {
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = useCallback(() => setRefreshToken((t) => t + 1), []);

  // "View" on a widget card opens the order detail modal DIRECTLY — the full
  // order is fetched by ref, no second search required.
  const [viewOrder, setViewOrder] = useState(null);
  const [viewBusyRef, setViewBusyRef] = useState('');
  const [viewError, setViewError] = useState('');

  const openOrder = useCallback(async (ref) => {
    setViewBusyRef(ref);
    setViewError('');
    try {
      setViewOrder(await orderService.get(ref));
    } catch (e) {
      setViewError(e.message || `Could not open order ${ref}.`);
    } finally {
      setViewBusyRef('');
    }
  }, []);

  return (
    <Layout>
      <div className="screen active" id="s-dashboard">
        <div className="dbp-top">
          <h2>Dashboard</h2>
          <p>Track saved orders by delivery status and product comment.</p>
        </div>

        {viewError && <div className="sol-error">{viewError}</div>}

        <DashboardWidgets refreshToken={refreshToken} onView={openOrder} viewBusyRef={viewBusyRef} />

        {viewOrder && (
          <SavedOrderDetailModal
            order={viewOrder}
            onClose={() => setViewOrder(null)}
            onDownload={() => downloadOrderExcel(viewOrder)}
            onSaved={(updated) => {
              setViewOrder(updated);
              bump(); // edits may move the order between buckets — refresh widgets
            }}
          />
        )}
      </div>
    </Layout>
  );
}
