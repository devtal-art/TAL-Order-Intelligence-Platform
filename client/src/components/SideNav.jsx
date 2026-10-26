import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Primary left navigation (V2.3). Moved out of the dark app bar — the two
// destinations live in a light sidebar beside the content, matching the
// step-card design language. Active route gets the brand-blue soft treatment.
export default function SideNav() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';
  const isAdmin = Boolean(user?.isAdmin);
  const item = ({ isActive }) => `sn-item${isActive ? ' active' : ''}`;
  return (
    <aside className="sidenav" aria-label="Primary navigation">
      <div className="sn-label">Menu</div>
      {/* View-only demo accounts have nothing to create — this destination is
          redirected away in ProtectedRoute too, so the link is just hidden here. */}
      {!isViewer && (
        <NavLink to="/" end className={item}>
          <span className="sn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <span className="sn-text">
            Upload &amp; Save
            <small>Create a new order</small>
          </span>
        </NavLink>
      )}
      {/* /dashboard/orders is a Dashboard sub-view — the tab stays lit there */}
      <NavLink to="/dashboard" className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <span className="sn-text">
          Dashboard
          <small>Track order buckets</small>
        </span>
      </NavLink>
      <NavLink to="/search" className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <span className="sn-text">
          Search
          <small>Find saved orders</small>
        </span>
      </NavLink>
      {/* Admin Portal — employee management, admin accounts only. */}
      {isAdmin && (
        <NavLink to="/admin/employees" className={item}>
          <span className="sn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="sn-text">
            Manage Employees
            <small>Admin portal</small>
          </span>
        </NavLink>
      )}
      {/* Admin Portal — database backup download, admin accounts only. */}
      {isAdmin && (
        <NavLink to="/admin/backup" className={item}>
          <span className="sn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </span>
          <span className="sn-text">
            Backup
            <small>Download database</small>
          </span>
        </NavLink>
      )}
    </aside>
  );
}
