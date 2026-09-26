import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Guards any route that requires authentication.
// Unauthenticated users are redirected to /login.
// The current path is passed as `state.from` so Login can redirect back
// after a successful login (optional — currently Login always goes to /).
//
// `viewerBlocked` (optional): when true, the read-only 'viewer' role (demo
// accounts) is redirected to /dashboard instead of rendering the route — used
// on the order-creation routes (Upload & Save, Create Manual Order), which
// are mutation-only screens with nothing sensible to view.
//
// `adminOnly` (optional): when true, only accounts with the `isAdmin` claim
// may render the route — everyone else is redirected to /dashboard. Used on
// the Admin Portal's employee-management screen.
export default function ProtectedRoute({ children, viewerBlocked = false, adminOnly = false }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (viewerBlocked && user?.role === 'viewer') {
    return <Navigate to="/dashboard" replace />;
  }

  if (adminOnly && !user?.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
