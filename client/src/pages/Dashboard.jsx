import { useCallback, useState } from 'react';
<<<<<<< HEAD
=======
import { ThemeProvider } from '@mui/material/styles';
>>>>>>> 87432db (New Dashboard)
import Layout from '../components/Layout.jsx';
import { SavedOrderDetailModal, downloadOrderExcel } from '../components/SavedOrderLookup.jsx';
import DashboardWidgets from '../components/DashboardWidgets.jsx';
import { orderService } from '../services/orderService.js';
<<<<<<< HEAD

// Dashboard page (V2.3). Purely the operational widgets — Order Status and
// Comments buckets side by side. Saved-order search lives on its own Search
=======
import { dashboardMuiTheme } from '../theme/dashboardMuiTheme.js';

// Dashboard page (V2.3). Purely the operational widgets — Item Status and
// Reason buckets side by side. Saved-order search lives on its own Search
>>>>>>> 87432db (New Dashboard)
// page (/search).
//
// Dynamic behaviour: `refreshToken` is bumped after ANY order edit saved from
// this page's View modal, which re-fetches the widget data — an order whose
// delivery status changed from Delivered to Half Delivered moves card
// immediately, no manual refresh.
export default function Dashboard() {
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = useCallback(() => setRefreshToken((t) => t + 1), []);

<<<<<<< HEAD
=======
  // "Export" — downloads the full multi-sheet dashboard workbook (V4.8).
  // Read-only; no widget state changes, so it doesn't touch refreshToken.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportDashboard = useCallback(async () => {
    setExporting(true);
    setExportError('');
    try {
      await orderService.exportDashboard();
    } catch (e) {
      setExportError(e.message || 'Could not export the dashboard. Please try again.');
    } finally {
      setExporting(false);
    }
  }, []);

>>>>>>> 87432db (New Dashboard)
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
<<<<<<< HEAD
    <Layout>
      <div className="screen active" id="s-dashboard">
        <div className="dbp-top">
          <h2>Dashboard</h2>
          <p>Track saved orders by delivery status and product comment.</p>
        </div>

        {viewError && <div className="sol-error">{viewError}</div>}

        <DashboardWidgets refreshToken={refreshToken} onView={openOrder} viewBusyRef={viewBusyRef} />
=======
    <Layout wide>
      <div className="screen active" id="s-dashboard">
        <div className="dbp-top dbp-top-row">
          <div>
            <h2>Dashboard</h2>
            <p>Order intelligence — status, items, delivery and team performance at a glance.</p>
          </div>
          <button className="sol-dl-btn" type="button" onClick={exportDashboard} disabled={exporting}>
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'Exporting…' : 'Export Dashboard'}
          </button>
        </div>

        {viewError && <div className="sol-error">{viewError}</div>}
        {exportError && <div className="sol-error">{exportError}</div>}

        {/* MUI theme is scoped to just the widgets tree (V5 redesign) — the
            SavedOrderDetailModal below is an existing, unrelated component
            reused as-is and stays outside it. */}
        <ThemeProvider theme={dashboardMuiTheme}>
          <DashboardWidgets refreshToken={refreshToken} onView={openOrder} viewBusyRef={viewBusyRef} />
        </ThemeProvider>
>>>>>>> 87432db (New Dashboard)

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
