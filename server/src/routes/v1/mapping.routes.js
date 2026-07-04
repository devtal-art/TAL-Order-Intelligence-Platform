import { Router } from 'express';
import { createMapping, listMappings, updateMapping } from '../../controllers/mappingController.js';

// Mounted at /api/v1/mappings
export const mappingRouter = Router();

mappingRouter.post('/', createMapping);
mappingRouter.get('/', listMappings);
mappingRouter.patch('/:id', updateMapping);
