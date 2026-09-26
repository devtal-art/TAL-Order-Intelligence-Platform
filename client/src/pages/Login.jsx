import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logoUrl from '../assets/artlogic-logo.svg';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  // Login-eligible usernames (Admin Portal — new, additive). Fetched from
  // the server instead of a hardcoded list, so an employee created (or
  // deleted) from the Admin Portal shows up here immediately without a code
  // change. GET /v1/auth/users is public — no auth exists yet at this point.
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_URL}/v1/auth/users`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data?.names) ? data.names : []);
      })
      .catch(() => {
        if (!cancelled) setUsersError('Could not load the user list. Please refresh the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // 'idle' -> 'loading' (awaiting the API) -> 'success' (plays the Sign In
  // animation below, then navigates away) | back to 'idle' on failure.
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  // Separate from `phase`: the truck-animation markup must already be
  // mounted at its RESTING state (no "animate" class) for at least one
  // paint before that class is added — CSS transitions (the text crossfade)
  // never play on an element's very first frame, only on a change to an
  // already-rendered one. Keyframe animations (the truck driving) don't
  // have this problem, which is why only the text used to snap instantly.
  const [animateNow, setAnimateNow] = useState(false);

  // Detect session-expired redirect from apiClient.js.
  const sessionExpired = searchParams.get('expired') === '1';

  // Already logged in → skip login page entirely. Skipped during the 'success'
  // phase — handleSubmit's own setTimeout navigates once the animation
  // finishes; without this guard, login() flipping isAuthenticated to true
  // would fire this effect immediately and cut the animation off before it
  // ever plays.
  useEffect(() => {
    if (isAuthenticated && phase !== 'success') navigate('/', { replace: true });
  }, [isAuthenticated, phase, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name || !password) {
      setError('Please select a name and enter your password.');
      return;
    }
    setPhase('loading');
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
        setPhase('idle');
        setAnimateNow(false);
        return;
      }
      login(data.token);
      // Play the Sign In success animation (~3.5s) before navigating away,
      // so it's actually visible rather than instantly replaced by the redirect.
      setPhase('success');
      // Mount the truck markup this render (resting state, no .animate).
      // Wait two frames before adding .animate — one frame just guarantees
      // React committed the DOM; the browser can still coalesce that with
      // the next style/paint. A second frame is the standard, reliable way
      // to force the "resting" style to actually paint first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateNow(true));
      });
      setTimeout(() => navigate('/', { replace: true }), 4000);
    } catch {
      setError('Cannot reach the server. Please check your connection.');
      setPhase('idle');
      setAnimateNow(false);
    }
  }

  const loading = phase !== 'idle';

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

          {/* User-list load failure banner */}
          {usersError && !error && (
            <div className="login-banner login-banner--error" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {usersError}
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
                  disabled={loading || (users.length === 0 && !usersError)}
                >
                  <option value="">{users.length === 0 && !usersError ? 'Loading users…' : 'Select user…'}</option>
                  {users.map((u) => (
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
              className={`login-btn${phase === 'success' ? ` signin-anim-btn${animateNow ? ' animate' : ''}` : ''}`}
              disabled={loading || !name || !password}
            >
              {phase === 'loading' ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : phase === 'success' ? (
                <>
                  <span className="signin-anim-default">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Sign In
                  </span>
                  <span className="signin-anim-success">
                    Signed In
                    <svg viewBox="0 0 12 10" aria-hidden="true">
                      <polyline points="1.5 6 4.5 9 10.5 1" />
                    </svg>
                  </span>
                  <div className="signin-anim-box" />
                  <div className="signin-anim-truck">
                    <div className="signin-anim-back" />
                    <div className="signin-anim-front">
                      <div className="signin-anim-window" />
                    </div>
                    <div className="signin-anim-light top" />
                    <div className="signin-anim-light bottom" />
                  </div>
                  <div className="signin-anim-lines" />
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
