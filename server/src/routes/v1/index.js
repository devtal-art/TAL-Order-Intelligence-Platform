import { Router } from 'express';
import { health } from '../../controllers/healthController.js';
import { catalogRouter } from './catalog.routes.js';
import { mappingRouter } from './mapping.routes.js';
import { resolveRouter } from './resolve.routes.js';
import { orderRouter } from './order.routes.js';
import { authRouter } from './auth.routes.js';
import { authenticate } from '../../middleware/authenticate.js';
import { blockViewerWrites } from '../../middleware/blockViewerWrites.js';

// v1 API router, mounted at /api/v1.
export const v1Router = Router();

// Public routes — no authentication required.
v1Router.get('/health', health);
v1Router.use('/auth', authRouter);

// Protected routes — every request must carry a valid JWT.
// The authenticate middleware verifies the token and attaches req.user.
// blockViewerWrites then rejects any non-GET request from the read-only
// 'viewer' role — a server-side backstop independent of the client UI.
v1Router.use('/catalog', authenticate, blockViewerWrites, catalogRouter);
v1Router.use('/mappings', authenticate, blockViewerWrites, mappingRouter);
v1Router.use('/resolve', authenticate, blockViewerWrites, resolveRouter);
v1Router.use('/orders', authenticate, blockViewerWrites, orderRouter);

