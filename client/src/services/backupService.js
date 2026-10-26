import { apiClient } from './apiClient.js';

// Admin Portal — database backup (new, additive, read-only).
//   GET /api/v1/admin/backup/summary  — what a backup taken now would contain
//   GET /api/v1/admin/backup/download — saves a .zip of the whole database
// The server picks the zip's filename (<db>-backup-<date>_<time>.zip); the
// fallback below is only used if that header is somehow missing.
export const backupService = {
  summary: () => apiClient.get('/v1/admin/backup/summary'),
  download: () => apiClient.download('/v1/admin/backup/download', 'database-backup.zip'),
};
