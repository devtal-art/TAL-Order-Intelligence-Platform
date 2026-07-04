import { Router } from 'express';
import { resolve } from '../../controllers/resolveController.js';

// Mounted at /api/v1/resolve
export const resolveRouter = Router();

resolveRouter.post('/', resolve);
