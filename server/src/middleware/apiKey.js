import { AppError } from '../utils/AppError.js';

// Optional shared-key auth. Entirely opt-in: when the API_KEY env var is not
// set, every request passes through untouched (development default). When it
// is set, every request must carry a matching "X-API-Key" header — except the
// health endpoints, which stay open for Render health checks.
export function apiKey(req, res, next) {
  const required = process.env.API_KEY;
  if (!required) return next();
  if (req.path === '/health' || req.path.endsWith('/health')) return next();
  if (req.get('x-api-key') === required) return next();
  return next(new AppError('UNAUTHORIZED', 'Missing or invalid API key.', { status: 401 }));
}
