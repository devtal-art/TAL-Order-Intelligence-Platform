import { Router } from 'express';
import { sendHelp } from '../../controllers/helpController.js';

// Mounted at /api/v1/help (new, additive).
export const helpRouter = Router();

helpRouter.post('/', sendHelp);
