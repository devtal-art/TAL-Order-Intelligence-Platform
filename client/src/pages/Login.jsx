import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logoUrl from '../assets/artlogic-logo.svg';

// The four internal users. Matches the seed script — a dropdown avoids
// username typos and removes the need for a free-text name field.
const USERS = ['Jasmeet', 'Sahil', 'Shubham', 'Alpa'];

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Detect session-expired redirect from apiClient.js.
  const sessionExpired = searchParams.get('expired') === '1';

  // Already logged in → skip login page entirely.
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name || !password) {
      setError('Please select a name and enter your password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || 'Invalid credentials. Please try again.');
        return;
      }
      login(data.token);
      navigate('/', { replace: true });
    } catch {
      setError('Cannot reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      {/* Brand bar — identical look to TopBar */}
      <header className="login-appbar">
        <div className="login-appbar-inner">
          <div className="login-brand">
            <img src={logoUrl} className="login-logo" alt="The Art Logic" />
            <span className="login-divider" aria-hidden="true" />
            <div className="login-titles">
              <h1 className="login-title">Order Intelligence Platform</h1>
              <p className="login-sub">Internal Operations Tool</p>
            </div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card">
          {/* Card header */}
          <div className="login-card-header">
            <div className="login-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <h2 className="login-card-title">Sign in to continue</h2>
            <p className="login-card-desc">Access is restricted to The Art Logic team.</p>
          </div>

          {/* Session expired banner */}
          {sessionExpired && !error && (
            <div className="login-banner login-banner--warn" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Your session has expired. Please log in again.
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="login-banner login-banner--error" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="login-name" className="login-label">User</label>
              <div className="login-select-wrap">
                <select
                  id="login-name"
                  className="login-select"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  required
                  disabled={loading}
                >
                  <option value="">Select user…</option>
                  {USERS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <svg className="login-select-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password" className="login-label">Password</label>
              <input
                id="login-password"
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={loading || !name || !password}
            >
              {loading ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
