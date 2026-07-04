import multer from 'multer';
import { AppError } from '../utils/AppError.js';

// Centralized error handler. Renders the standard contract error envelope:
// { error: { code, message, details, requestId } }
// Express identifies it by its four arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const requestId = req.id;

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
  }

  // Multer upload errors (e.g. file too large).
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'The uploaded file is too large.', requestId },
      });
    }
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err.message, requestId },
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error', requestId },
  });
}
