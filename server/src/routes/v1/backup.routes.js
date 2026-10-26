import { Router } from 'express';
import { downloadBackup, backupSummary } from '../../controllers/backupController.js';

// Mounted at /api/v1/admin/backup (Admin Portal — new, additive, read-only).
// authenticate + requireAdmin are applied where this router is mounted
// (routes/v1/index.js), same as the employee routes.
export const backupRouter = Router();

backupRouter.get('/summary', backupSummary);
backupRouter.get('/download', downloadBackup);
