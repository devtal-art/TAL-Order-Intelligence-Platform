import { NavLink } from 'react-router-dom';

// Primary nav for the Customer Intelligence module — a sibling of
// SideNav.jsx, not a shared component, so Order Processing's nav is never
// at risk of picking up Customer Intelligence destinations or vice versa.
// Phase 2 adds Rankings / Analytics Dashboard / Reports alongside Phase 1's
// Customers link.
export default function CustomerSideNav() {
  const item = ({ isActive }) => `sn-item${isActive ? ' active' : ''}`;
  return (
    <aside className="sidenav" aria-label="Customer Intelligence navigation">
      <div className="sn-label">Customer Intelligence</div>
      <NavLink to="/customers" end className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <span className="sn-text">
          Customers
          <small>Browse &amp; search</small>
        </span>
      </NavLink>
      <NavLink to="/customers/analytics" className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <span className="sn-text">
          Analytics
          <small>Platform-wide dashboard</small>
        </span>
      </NavLink>
      <NavLink to="/customers/rankings" className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 20V10M18 20V4M6 20v-6" />
          </svg>
        </span>
        <span className="sn-text">
          Rankings
          <small>Customer leaderboards</small>
        </span>
      </NavLink>
      <NavLink to="/customers/reports" className={item}>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <span className="sn-text">
          Reports
          <small>Export CSV / Excel / PDF</small>
        </span>
      </NavLink>
      {/* Back to the Order Processing module. /dashboard (not /) because every
          role can open it — / is redirected away for view-only accounts. */}
      <NavLink to="/dashboard" className={item} end>
        <span className="sn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </span>
        <span className="sn-text">
          Order Processing
          <small>Back to orders module</small>
        </span>
      </NavLink>
    </aside>
  );
}
