// Thin fetch wrapper — the single place services go through to reach the backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Optional shared API key (must match the server's API_KEY when that is set).
const API_KEY = import.meta.env.VITE_API_KEY;
const authHeaders = API_KEY ? { 'X-API-Key': API_KEY } : {};

// Turns a non-2xx response into an Error carrying the contract's code/message.
async function handleResponse(res) {
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      // non-JSON error body
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
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...(options.headers || {}) },
    ...options,
  });
  return handleResponse(res);
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  // Multipart upload: let the browser set the Content-Type/boundary for FormData.
  upload: (path, formData) =>
    fetch(`${BASE_URL}${path}`, { method: 'POST', headers: authHeaders, body: formData }).then(handleResponse),
};
