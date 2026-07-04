import { Router } from 'express';
import { health } from '../controllers/healthController.js';

// Root API router. Only an infrastructure health check exists today.
// Future feature routers (catalog, matching, mappings) will be mounted here.
export const router = Router();

router.get('/health', health);
