import { Router } from 'express';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  setEmployeeDisabled,
  resetEmployeePassword,
  deleteEmployee,
  listDeletedEmployees,
} from '../../controllers/employeeController.js';

// Mounted at /api/v1/admin/employees (Admin Portal — new, additive).
// authenticate + requireAdmin are applied where this router is mounted
// (routes/v1/index.js) — deliberately NOT blockViewerWrites, since an
// admin's effective role is 'viewer' and that middleware would otherwise
// reject the admin's own writes here.
export const employeeRouter = Router();

employeeRouter.get('/', listEmployees);
employeeRouter.get('/deleted', listDeletedEmployees);
employeeRouter.post('/', createEmployee);
employeeRouter.patch('/:id', updateEmployee);
employeeRouter.patch('/:id/disable', setEmployeeDisabled);
employeeRouter.patch('/:id/password', resetEmployeePassword);
employeeRouter.delete('/:id', deleteEmployee);
