import { Router } from 'express';
import { saveOrder, listOrders, getOrder, updateOrder } from '../../controllers/orderController.js';

// Mounted at /api/v1/orders (V1.2 — new, additive).
export const orderRouter = Router();

orderRouter.post('/', saveOrder);
orderRouter.get('/', listOrders);
orderRouter.get('/:ref', getOrder);
orderRouter.patch('/:ref', updateOrder);
