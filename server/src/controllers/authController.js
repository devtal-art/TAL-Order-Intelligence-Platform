import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// POST /api/v1/auth/login
// Body: { name: string, password: string }
// Returns: { token: string, user: { id, name, role } }
//
// Security notes:
//   • bcrypt.compare() is always called, even when the user is not found,
//     to prevent timing-based username enumeration.
//   • The same generic error message is returned for both "user not found"
//     and "wrong password" — the client cannot distinguish the two cases.
//   • Inactive users are rejected after the bcrypt check (same timing).
export async function login(req, res, next) {
  try {
    const { name, password } = req.body || {};

    if (!name || typeof name !== 'string' || !password || typeof password !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'Name and password are required.', { status: 400 });
    }

    // Look up the user. Use select('+passwordHash') because the toJSON
    // transform strips it — we need it only for bcrypt.compare().
    const user = await User.findOne({ name: name.trim() }).select('+passwordHash').lean();

    // Always run bcrypt to prevent timing-based enumeration.
    // When no user is found, compare against a dummy hash so the response
    // time is indistinguishable from a real (but wrong-password) attempt.
    const DUMMY_HASH = '$2b$12$invalidhashpaddingtomakethiscompareslowenough000000000000';
    const hashToCompare = user ? user.passwordHash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatches || !user.active) {
      throw new AppError('UNAUTHORIZED', 'Invalid credentials.', { status: 401 });
    }

    // Mirrors authenticate.js's effectiveRole computation — a disabled
    // account or an 'admin' account both start out as an effective 'viewer'.
    // This is a display baseline only; every subsequent request re-derives
    // it fresh from Mongo (authenticate.js), so a later Disable/Delete takes
    // effect immediately rather than waiting for this token to expire.
    const isAdmin = user.role === 'admin';
    const payload = {
      id: String(user._id),
      name: user.name,
      role: user.disabled || isAdmin ? 'viewer' : user.role,
      isAdmin,
    };

    const token = jwt.sign(payload, env.jwtSecret, {
      expiresIn: '8h',
      issuer: 'order-intelligence',
    });

    return res.status(200).json({
      token,
      user: payload,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/v1/auth/users
// Returns: { names: string[] }
//
// Public (no auth — needed before login exists) and deliberately minimal:
// just the login-eligible names, nothing else about the account. Powers the
// Login page's "User" dropdown (client/src/pages/Login.jsx), which used to
// hardcode this list — now it stays in sync automatically as the Admin
// Portal creates/deletes employees, with no separate list to hand-edit.
export async function listLoginNames(req, res, next) {
  try {
    const users = await User.find({ active: true }).select('name').sort({ name: 1 }).lean();
    res.status(200).json({ names: users.map((u) => u.name) });
  } catch (err) {
    next(err);
  }
}
