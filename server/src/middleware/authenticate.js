import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// Reusable JWT authentication middleware.
//
// Reads the token from the Authorization header:
//   Authorization: Bearer <token>
//
// On success: attaches `req.user = { id, name, role }` and calls next().
// On missing token: 401 UNAUTHORIZED.
// On expired token: 401 UNAUTHORIZED with { expiredToken: true } in the
//   response body — the frontend uses this flag to show the session-expired
//   message rather than a generic "please log in" redirect.
// On any other JWT error (invalid signature, malformed): 401 UNAUTHORIZED.
export function authenticate(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new AppError('UNAUTHORIZED', 'Authentication required. Please log in.', { status: 401 }));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { issuer: 'order-intelligence' });
    // Attach only the claims the application needs — never forward the raw payload.
    req.user = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
    };
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
    return next(new AppError('UNAUTHORIZED', 'Invalid or malformed token.', { status: 401 }));
  }
}
