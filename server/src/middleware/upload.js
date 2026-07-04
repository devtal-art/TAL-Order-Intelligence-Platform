import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const CSV_MIMES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];

// In-memory multipart handling for the catalog CSV. 20 MB cap (LIMIT_FILE_SIZE
// is mapped to 413 by the error handler). Non-CSV files are rejected as 422.
export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCsv = file.originalname.toLowerCase().endsWith('.csv') || CSV_MIMES.includes(file.mimetype);
    if (isCsv) {
      cb(null, true);
    } else {
      cb(
        new AppError('UNPROCESSABLE', 'Only .csv files are accepted.', {
          status: 422,
          details: [{ field: 'file', issue: 'must be a .csv file' }],
        })
      );
    }
  },
});
