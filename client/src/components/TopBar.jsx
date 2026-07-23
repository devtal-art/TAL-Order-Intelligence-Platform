import logoUrl from '../assets/artlogic-logo.svg';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

// Enterprise app bar: The Art Logic mark, product title + subtitle on the left;
// authenticated user name + Logout button on the right (V3.0).
export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="appbar-brand">
          <img src={logoUrl} className="appbar-logo" alt="The Art Logic" />
          <span className="appbar-divider" aria-hidden="true" />
          <div className="appbar-titles">
            <h1 className="appbar-title">Order Intelligence Platform</h1>
            <p className="appbar-sub">Internal Operations Tool</p>
          </div>
        </div>

        {user && (
          <div className="appbar-user-area">
            <div className="appbar-user-info">
              <span className="appbar-user-label">Logged in as</span>
              <span className="appbar-user-name">{user.name}</span>
            </div>
            <button
              className="appbar-logout"
              onClick={handleLogout}
              type="button"
              title="Sign out"
              aria-label={`Sign out (${user.name})`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

