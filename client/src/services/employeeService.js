import { apiClient } from './apiClient.js';

// Admin Portal — employee management (new, additive).
//   GET    /api/v1/admin/employees            — list employees
//   POST   /api/v1/admin/employees            — create an employee
//   PATCH  /api/v1/admin/employees/:id        — rename and/or change access level
//   PATCH  /api/v1/admin/employees/:id/disable — enable/disable
//   PATCH  /api/v1/admin/employees/:id/password — set a new password
//   DELETE /api/v1/admin/employees/:id        — delete (reassigns their orders to Chat Team)
//   GET    /api/v1/admin/employees/deleted     — deleted employees + how many orders each transferred
export const employeeService = {
  list: () => apiClient.get('/v1/admin/employees'),

  listDeleted: () => apiClient.get('/v1/admin/employees/deleted'),

  // { name, password, permission: 'edit' | 'view' }
  create: (employee) => apiClient.post('/v1/admin/employees', employee),

  // { name?, permission? } — a rename propagates to every order/log entry
  // that shows this employee's name, server-side.
  update: (id, changes) => apiClient.patch(`/v1/admin/employees/${encodeURIComponent(id)}`, changes),

  setDisabled: (id, disabled) =>
    apiClient.patch(`/v1/admin/employees/${encodeURIComponent(id)}/disable`, { disabled }),

  resetPassword: (id, password) =>
    apiClient.patch(`/v1/admin/employees/${encodeURIComponent(id)}/password`, { password }),

  // Resolves to { reassignedOrders: number }
  remove: (id) => apiClient.delete(`/v1/admin/employees/${encodeURIComponent(id)}`),
};
