import { Router } from 'express';
import {
  saveOrder,
  listOrders,
  getOrder,
  updateOrder,
  setOrderComments,
  setOrderFulfillment,
  setOrderNotes,
  setOrderStatus,
  setOrderDeliveryDate,
  setOrderProcessedBy,
  getDashboard,
  listDashboardOrders,
  exportDashboard,
  autocompleteCompanies,
} from '../../controllers/orderController.js';

// Mounted at /api/v1/orders (V1.2 — new, additive).
export const orderRouter = Router();

orderRouter.post('/', saveOrder);
orderRouter.get('/', listOrders);
// Dashboard routes (V2.2) MUST be registered before GET /:ref, otherwise
// Express would treat "dashboard" as a Portal Order Ref.
orderRouter.get('/dashboard', getDashboard);
orderRouter.get('/dashboard/orders', listDashboardOrders);
orderRouter.get('/dashboard/export', exportDashboard);
orderRouter.get('/companies/autocomplete', autocompleteCompanies);
orderRouter.get('/:ref', getOrder);
orderRouter.patch('/:ref/comments', setOrderComments);
orderRouter.patch('/:ref/fulfillment', setOrderFulfillment);
orderRouter.patch('/:ref/notes', setOrderNotes);
orderRouter.patch('/:ref/status', setOrderStatus);
orderRouter.patch('/:ref/delivery-date', setOrderDeliveryDate);
orderRouter.patch('/:ref/processed-by', setOrderProcessedBy);
orderRouter.patch('/:ref', updateOrder);
