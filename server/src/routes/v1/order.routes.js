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
  setOrderDiscountProvided,
  setOrderProcessedBy,
  getDashboard,
  listDashboardOrders,
  exportDashboard,
  autocompleteCompanies,
  nextManualOrderRef,
  createManualOrder,
  getOrderLogs,
  getRecentActivity,
} from '../../controllers/orderController.js';

// Mounted at /api/v1/orders (V1.2 — new, additive).
export const orderRouter = Router();

orderRouter.post('/', saveOrder);
orderRouter.get('/', listOrders);
// Dashboard AND manual-order routes (V2.2 / V5) MUST be registered before
// GET /:ref, otherwise Express would treat "dashboard"/"manual" as a
// Portal Order Ref.
orderRouter.get('/dashboard', getDashboard);
orderRouter.get('/dashboard/orders', listDashboardOrders);
orderRouter.get('/dashboard/export', exportDashboard);
orderRouter.get('/companies/autocomplete', autocompleteCompanies);
orderRouter.get('/manual/next-ref', nextManualOrderRef);
orderRouter.post('/manual', createManualOrder);
// Order Activity Log — 'logs/recent' MUST be registered before GET /:ref for
// the same reason as 'dashboard'/'manual' above (otherwise Express would
// treat "logs" as a Portal Order Ref).
orderRouter.get('/logs/recent', getRecentActivity);
orderRouter.get('/:ref', getOrder);
orderRouter.get('/:ref/logs', getOrderLogs);
orderRouter.patch('/:ref/comments', setOrderComments);
orderRouter.patch('/:ref/fulfillment', setOrderFulfillment);
orderRouter.patch('/:ref/notes', setOrderNotes);
orderRouter.patch('/:ref/status', setOrderStatus);
orderRouter.patch('/:ref/delivery-date', setOrderDeliveryDate);
orderRouter.patch('/:ref/discount-provided', setOrderDiscountProvided);
orderRouter.patch('/:ref/processed-by', setOrderProcessedBy);
orderRouter.patch('/:ref', updateOrder);
