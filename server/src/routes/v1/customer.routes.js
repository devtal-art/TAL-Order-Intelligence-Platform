import { Router } from 'express';
import { listCustomers, getCustomerProfile } from '../../controllers/customerIntelligenceController.js';

// Mounted at /api/v1/customers (Customer Intelligence module — new, independent).
export const customerRouter = Router();

customerRouter.get('/', listCustomers);
customerRouter.get('/:name', getCustomerProfile);
