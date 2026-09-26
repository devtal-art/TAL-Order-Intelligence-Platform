import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

// ────────────────────────────────────────────────
//  AuthContext — JWT Authentication (V3.0)
//
//  Provides the authentication state to the entire React tree.
//  The JWT is stored in localStorage under the key 'oi_jwt' and decoded
//  client-side for display purposes only. The server verifies the signature
//  on every protected request — the client NEVER trusts its own decode.
//
//  Exposes: { user, token, isAuthenticated, login, logout }
// ────────────────────────────────────────────────

const TOKEN_KEY = 'oi_jwt';

// Decode the JWT payload without verifying the signature.
// Used only for reading display claims (name, role) — security relies on the
// server-side verification in the authenticate middleware.
function decodePayload(token) {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    // atob doesn't handle URL-safe base64 — replace chars and add padding.
    const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Check if a decoded JWT payload is expired.
function isExpired(payload) {
  if (!payload || !payload.exp) return false;
  return Date.now() / 1000 > payload.exp;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return null;
    const payload = decodePayload(stored);
    if (!payload || isExpired(payload)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return { id: payload.id, name: payload.name, role: payload.role, isAdmin: Boolean(payload.isAdmin) };
  });

  // Persist token and decode user on login.
  const login = useCallback((newToken) => {
    const payload = decodePayload(newToken);
    if (!payload || isExpired(payload)) return;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser({ id: payload.id, name: payload.name, role: payload.role, isAdmin: Boolean(payload.isAdmin) });
  }, []);

  // Clear token and user on logout.
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Passively check for expiry on every render cycle (e.g. after a long idle).
  // This covers the case where the page was open but never made an API call —
  // the server-side 401 + apiClient redirect handles the active-request case.
  useEffect(() => {
    if (!token) return;
    const payload = decodePayload(token);
    if (isExpired(payload)) {
      logout();
    }
  });

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
