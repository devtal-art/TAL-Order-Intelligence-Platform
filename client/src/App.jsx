import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DashboardList from './pages/DashboardList.jsx';
import DeliveryDatesList from './pages/DeliveryDatesList.jsx';
import ActivityLogList from './pages/ActivityLogList.jsx';
import Search from './pages/Search.jsx';
import ProductSearchResults from './pages/ProductSearchResults.jsx';
import CreateManualOrder from './pages/CreateManualOrder.jsx';
import AdminEmployees from './pages/AdminEmployees.jsx';
import AdminBackup from './pages/AdminBackup.jsx';
import OsPendingList from './pages/OsPendingList.jsx';
import CustomerList from './pages/customer/CustomerList.jsx';
import CustomerProfile from './pages/customer/CustomerProfile.jsx';
import CustomerRankings from './pages/customer/CustomerRankings.jsx';
import CustomerAnalyticsDashboard from './pages/customer/CustomerAnalyticsDashboard.jsx';
import CustomerReports from './pages/customer/CustomerReports.jsx';

// Route map:
//   /login                    — public, no auth required
//   /                         — Upload & Save (protected)
//   /dashboard                — operational widgets (protected)
//   /dashboard/orders         — bucket list "View All" (protected)
//   /dashboard/delivery-dates — all upcoming delivery dates "View All" (protected)
//   /dashboard/activity       — full cross-order Activity Log "View All" (protected)
//   /dashboard/os-pending     — OS Pending by Item "View All" (protected, new, additive)
//   /search                   — saved-order search (protected)
//   /search/products          — product search results (protected, V5.1 — new, additive)
//   /orders/manual            — Create Manual Order (protected, V3.1 — new, additive)
//   /admin/employees          — Admin Portal: Manage Employees (protected, admin-only)
//   /admin/backup             — Admin Portal: Database Backup (protected, admin-only)
//   /customers                — Customer Intelligence: customer list (protected, new module)
//   /customers/analytics      — Customer Intelligence: analytics dashboard (protected, new module)
//   /customers/rankings       — Customer Intelligence: rankings/leaderboards (protected, new module)
//   /customers/reports        — Customer Intelligence: reports/export (protected, new module)
//   /customers/:name          — Customer Intelligence: customer profile (protected, new module)
export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — all routes behind ProtectedRoute */}
        <Route
          path="/"
          element={
            <ProtectedRoute viewerBlocked>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/orders"
          element={
            <ProtectedRoute>
              <DashboardList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/delivery-dates"
          element={
            <ProtectedRoute>
              <DeliveryDatesList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/activity"
          element={
            <ProtectedRoute>
              <ActivityLogList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/os-pending"
          element={
            <ProtectedRoute>
              <OsPendingList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <Search />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search/products"
          element={
            <ProtectedRoute>
              <ProductSearchResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/manual"
          element={
            <ProtectedRoute viewerBlocked>
              <CreateManualOrder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/employees"
          element={
            <ProtectedRoute adminOnly>
              <AdminEmployees />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/backup"
          element={
            <ProtectedRoute adminOnly>
              <AdminBackup />
            </ProtectedRoute>
          }
        />

        {/* Protected — Customer Intelligence (new, independent, read-only module) */}
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <CustomerList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/analytics"
          element={
            <ProtectedRoute>
              <CustomerAnalyticsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/rankings"
          element={
            <ProtectedRoute>
              <CustomerRankings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/reports"
          element={
            <ProtectedRoute>
              <CustomerReports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:name"
          element={
            <ProtectedRoute>
              <CustomerProfile />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

