import { Router } from 'express';
import { uploadCatalog, getCatalogStatus, getCatalogProducts } from '../../controllers/catalogController.js';
import { uploadCsv } from '../../middleware/upload.js';

// Mounted at /api/v1/catalog
export const catalogRouter = Router();

catalogRouter.post('/', uploadCsv.single('file'), uploadCatalog);
catalogRouter.get('/status', getCatalogStatus);
catalogRouter.get('/products', getCatalogProducts);
