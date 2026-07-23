import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Guards any route that requires authentication.
// Unauthenticated users are redirected to /login.
// The current path is passed as `state.from` so Login can redirect back
// after a successful login (optional — currently Login always goes to /).
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
