import { Router } from 'express';
import { health } from '../../controllers/healthController.js';
import { catalogRouter } from './catalog.routes.js';
import { mappingRouter } from './mapping.routes.js';
import { resolveRouter } from './resolve.routes.js';
import { orderRouter } from './order.routes.js';

// v1 API router, mounted at /api/v1.
export const v1Router = Router();

v1Router.get('/health', health);
v1Router.use('/catalog', catalogRouter);
v1Router.use('/mappings', mappingRouter);
v1Router.use('/resolve', resolveRouter);
v1Router.use('/orders', orderRouter);
