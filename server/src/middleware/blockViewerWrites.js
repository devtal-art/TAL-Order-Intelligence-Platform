import { AppError } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

// Server-side backstop for the read-only 'viewer' role (demo accounts, e.g.
// Gagandeep): rejects every state-changing request regardless of what the
// client UI shows or hides, so a viewer account can never create/edit/delete
// data even via a direct API call. GET/HEAD requests are unaffected — every
// other role is unaffected since req.user.role is never 'viewer' for them.
export function blockViewerWrites(req, res, next) {
  if (req.user?.role === 'viewer' && !SAFE_METHODS.has(req.method)) {
    return next(new AppError('FORBIDDEN', 'This account has view-only access.', { status: 403 }));
  }
  return next();
}
