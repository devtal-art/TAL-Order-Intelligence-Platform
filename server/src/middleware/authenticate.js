import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';

// Reusable JWT authentication middleware.
//
// Reads the token from the Authorization header:
//   Authorization: Bearer <token>
//
// On success: attaches `req.user = { id, name, role, isAdmin }` and calls next().
// On missing token: 401 UNAUTHORIZED.
// On expired token: 401 UNAUTHORIZED with { expiredToken: true } in the
//   response body — the frontend uses this flag to show the session-expired
//   message rather than a generic "please log in" redirect.
// On any other JWT error (invalid signature, malformed): 401 UNAUTHORIZED.
//
// The user's role/active/disabled state is re-read from Mongo on EVERY
// request (rather than trusted from the JWT for the whole 8h session) so an
// admin's Disable/Delete action (see employeeService.js) takes effect on the
// user's very next request instead of waiting for their token to expire.
//   • `role` is the EFFECTIVE role for authorization purposes: a disabled
//     account or an 'admin' account both collapse to 'viewer' here, so every
//     existing viewer check (blockViewerWrites, isViewer, etc.) already does
//     the right thing with no changes of its own.
//   • `isAdmin` is a separate claim, true only for real admin accounts,
//     used solely to gate the admin-portal routes/screens.
export async function authenticate(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new AppError('UNAUTHORIZED', 'Authentication required. Please log in.', { status: 401 }));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { issuer: 'order-intelligence' });

    const user = await User.findById(payload.id).select('name role active disabled').lean();
    if (!user || user.active === false) {
      return next(new AppError('UNAUTHORIZED', 'This account is no longer active.', { status: 401 }));
    }

    const isAdmin = user.role === 'admin';
    const effectiveRole = user.disabled || isAdmin ? 'viewer' : user.role;

    req.user = { id: payload.id, name: user.name, role: effectiveRole, isAdmin };
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // Return a structured response so the client can show a specific message.
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Your session has expired. Please log in again.',
          expiredToken: true,
          requestId: req.id,
        },
      });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError('UNAUTHORIZED', 'Invalid or malformed token.', { status: 401 }));
    }
    return next(err);
  }
}
