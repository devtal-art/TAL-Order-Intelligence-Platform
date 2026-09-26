import * as employeeService from '../services/employeeService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/admin/employees — list all manageable employees (excludes
// admin accounts and anyone already deleted).
export async function listEmployees(req, res, next) {
  try {
    ensureDb();
    const employees = await employeeService.listEmployees();
    res.status(200).json({ data: employees });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/employees — create a new employee.
// Body: { name: string, password: string, permission: 'edit' | 'view' }
export async function createEmployee(req, res, next) {
  try {
    ensureDb();
    const { name, password, permission } = req.body || {};
    const employee = await employeeService.createEmployee({ name, password, permission });
    res.status(201).json(employee);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/employees/:id — Body: { name?: string, permission?: 'edit' | 'view' }
// Renames the employee and/or changes their access level. A rename
// propagates to Order.processed_by and OrderLog.actor everywhere they
// appear (see employeeService.updateEmployee).
export async function updateEmployee(req, res, next) {
  try {
    ensureDb();
    const { name, permission } = req.body || {};
    const employee = await employeeService.updateEmployee(req.params.id, { name, permission });
    res.status(200).json(employee);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/employees/:id/disable — Body: { disabled: boolean }
export async function setEmployeeDisabled(req, res, next) {
  try {
    ensureDb();
    const { disabled } = req.body || {};
    const employee = await employeeService.setEmployeeDisabled(req.params.id, Boolean(disabled));
    res.status(200).json(employee);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/employees/:id/password — Body: { password: string }
export async function resetEmployeePassword(req, res, next) {
  try {
    ensureDb();
    const { password } = req.body || {};
    const employee = await employeeService.resetEmployeePassword(req.params.id, password);
    res.status(200).json(employee);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/employees/:id — soft-deletes the employee and
// reassigns every order they processed to 'Chat Team'.
export async function deleteEmployee(req, res, next) {
  try {
    ensureDb();
    const result = await employeeService.deleteEmployee(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/employees/deleted — every soft-deleted employee, with
// how many orders were transferred to Chat Team on their delete.
export async function listDeletedEmployees(req, res, next) {
  try {
    ensureDb();
    const employees = await employeeService.listDeletedEmployees();
    res.status(200).json({ data: employees });
  } catch (err) {
    next(err);
  }
}
