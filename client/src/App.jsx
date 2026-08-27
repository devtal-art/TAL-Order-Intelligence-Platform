import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DashboardList from './pages/DashboardList.jsx';
import DeliveryDatesList from './pages/DeliveryDatesList.jsx';
import Search from './pages/Search.jsx';
import ProductSearchResults from './pages/ProductSearchResults.jsx';
import CreateManualOrder from './pages/CreateManualOrder.jsx';

// Route map:
//   /login                    — public, no auth required
//   /                         — Upload & Save (protected)
//   /dashboard                — operational widgets (protected)
//   /dashboard/orders         — bucket list "View All" (protected)
//   /dashboard/delivery-dates — all upcoming delivery dates "View All" (protected)
//   /search                   — saved-order search (protected)
//   /search/products          — product search results (protected, V5.1 — new, additive)
//   /orders/manual            — Create Manual Order (protected, V3.1 — new, additive)
export default function App() {
  return (
    <AuthProvider>
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
      </Routes>
    </AuthProvider>
  );
}

