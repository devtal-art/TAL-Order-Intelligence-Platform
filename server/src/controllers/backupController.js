import mongoose from 'mongoose';
import * as backupService from '../services/backupService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/admin/backup/download — streams a .zip of the whole database
// this server is connected to (read-only; see backupService.js). Admin only.
export async function downloadBackup(req, res, next) {
  try {
    ensureDb();
    // Resolved before any response bytes are sent, so a DB problem still
    // returns the normal JSON error envelope.
    const collections = await backupService.listBackupCollections();
    const filename = backupService.backupFilename(mongoose.connection.db.databaseName);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const manifest = await backupService.streamBackupZip(res, collections);
    // eslint-disable-next-line no-console
    console.log(
      `Database backup downloaded by "${req.user.name}" (${req.user.id}) — ${filename}, collections: ${JSON.stringify(manifest.collections)}`
    );
  } catch (err) {
    if (res.headersSent) {
      // Zip already partly sent: can't switch to a JSON error. Kill the
      // connection so the browser sees a failed download, not a truncated
      // "valid-looking" file.
      // eslint-disable-next-line no-console
      console.error('Database backup failed mid-stream:', err);
      res.destroy(err);
      return;
    }
    next(err);
  }
}

// GET /api/v1/admin/backup/summary — read-only overview of what a backup
// taken right now would contain (counts per collection, order breakdown...).
export async function backupSummary(req, res, next) {
  try {
    ensureDb();
    res.status(200).json(await backupService.getBackupSummary());
  } catch (err) {
    next(err);
  }
}
