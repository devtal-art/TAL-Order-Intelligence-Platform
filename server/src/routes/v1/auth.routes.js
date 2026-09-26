import { Router } from 'express';
import { login, listLoginNames } from '../../controllers/authController.js';

// Auth routes — mounted at /api/v1/auth.
// These endpoints are intentionally PUBLIC (no authenticate middleware):
//   POST /api/v1/auth/login — exchange credentials for a JWT
//   GET  /api/v1/auth/users — login-eligible usernames, for the Login dropdown
//
// No signup, no forgot-password, no OAuth — internal users only.
export const authRouter = Router();

authRouter.post('/login', login);
authRouter.get('/users', listLoginNames);
