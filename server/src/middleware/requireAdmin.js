import { AppError } from '../utils/AppError.js';

// Gates the admin-portal routes (employee management). Independent of
// blockViewerWrites — an admin's effective `role` is 'viewer' (see
// authenticate.js), so this checks the separate `isAdmin` claim instead.
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return next(new AppError('FORBIDDEN', 'Admin access required.', { status: 403 }));
  }
  return next();
}
