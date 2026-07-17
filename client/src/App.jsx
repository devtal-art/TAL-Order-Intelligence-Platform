import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DashboardList from './pages/DashboardList.jsx';
import Search from './pages/Search.jsx';

// Three primary screens (V2.3 UI restructure):
//   /                 — Upload & Save: everything that creates a new order
//   /dashboard        — operational widgets (Order Status + Comments buckets)
//   /dashboard/orders — "View All" for one dashboard bucket (filtered table)
//   /search           — saved-order search + recent processed orders
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/orders" element={<DashboardList />} />
      <Route path="/search" element={<Search />} />
    </Routes>
  );
}
