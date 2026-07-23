// Thin fetch wrapper — the single place services go through to reach the backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Optional shared API key (must match the server's API_KEY when that is set).
const API_KEY = import.meta.env.VITE_API_KEY;
const apiKeyHeaders = API_KEY ? { 'X-API-Key': API_KEY } : {};

// JWT token storage key — must match AuthContext.
const TOKEN_KEY = 'oi_jwt';

// Read the current JWT from localStorage on every call so that login/logout
// changes are automatically reflected without needing a page reload.
function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Turns a non-2xx response into an Error carrying the contract's code/message.
// Special case: 401 with expiredToken=true → redirect to /login?expired=1.
// Any other 401 → redirect to /login (session gone or never started).
async function handleResponse(res) {
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      // non-JSON error body
    }

    if (res.status === 401) {
      const expiredToken = payload?.error?.expiredToken;
      // Use replace so the browser Back button doesn't loop back to a broken page.
      window.location.replace(expiredToken ? '/login?expired=1' : '/login');
      // Return a never-resolving promise — the redirect is happening.
      return new Promise(() => {});
    }

    const message = (payload && payload.error && payload.error.message) || `API ${res.status}: ${res.statusText}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = payload && payload.error && payload.error.code;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...apiKeyHeaders,
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  return handleResponse(res);
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  // Multipart upload: let the browser set the Content-Type/boundary for FormData.
  // Auth header is still injected for the upload path.
  upload: (path, formData) =>
    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...apiKeyHeaders, ...getAuthHeaders() },
      body: formData,
    }).then(handleResponse),
};

