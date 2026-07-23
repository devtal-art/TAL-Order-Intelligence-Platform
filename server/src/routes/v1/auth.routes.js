import { Router } from 'express';
import { login } from '../../controllers/authController.js';

// Auth routes — mounted at /api/v1/auth.
// These endpoints are intentionally PUBLIC (no authenticate middleware):
//   POST /api/v1/auth/login — exchange credentials for a JWT
//
// No signup, no forgot-password, no OAuth — internal users only.
export const authRouter = Router();

authRouter.post('/login', login);
