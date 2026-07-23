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

    const payload = {
      id: String(user._id),
      name: user.name,
      role: user.role,
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
