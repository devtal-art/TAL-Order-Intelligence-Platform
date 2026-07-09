import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { apiKey } from './middleware/apiKey.js';
import { router } from './routes/index.js';
import { v1Router } from './routes/v1/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/AppError.js';

// Builds and configures the Express application. Kept separate from index.js so
// it can be imported by tests later without starting a listener.
export function createApp() {
  const app = express();

  // Production-ready CORS. Allowed origins: localhost dev + the deployed client
  // (process.env.CLIENT_URL, injected via Render env vars — never hardcoded).
  // Requests with no Origin header (curl, Postman, health checks) are allowed.
  // Trailing slashes are trimmed so "https://site/" and "https://site" both match.
  const stripSlash = (o) => o.replace(/\/+$/, '');
  const allowedOrigins = ['http://localhost:5173', process.env.CLIENT_URL]
    .filter(Boolean)
    .map(stripSlash);
  // eslint-disable-next-line no-console
  console.log('CORS allowed origins:', allowedOrigins);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(stripSlash(origin))) {
          callback(null, true);
        } else {
          // AppError → the error handler renders a clean 403 instead of a 500.
          callback(new AppError('FORBIDDEN', `Origin not allowed by CORS: ${origin}`, { status: 403 }));
        }
      },
    })
  );
  // 1 MB cap: order snapshots (parsed HTML + resolution) can exceed the 100 KB
  // body-parser default on large orders.
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);

  app.use('/api', apiKey, router); // unversioned infra alias (/api/health)
  app.use('/api/v1', apiKey, v1Router); // versioned API

  // Fallbacks — must be registered last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
