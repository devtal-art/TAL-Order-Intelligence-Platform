import mongoose from 'mongoose';
import { AppError } from './AppError.js';

// Guard used by controllers that need the database. Returns a clean 503 instead
// of letting queries hang/buffer when MongoDB is not connected.
export function ensureDb() {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Database is not connected.', { status: 503 });
  }
}
