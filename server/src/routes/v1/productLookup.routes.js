import { Router } from 'express';
import { lookupProducts } from '../../controllers/productLookupController.js';

// Mounted at /api/v1/products
export const productLookupRouter = Router();

productLookupRouter.get('/lookup', lookupProducts);
