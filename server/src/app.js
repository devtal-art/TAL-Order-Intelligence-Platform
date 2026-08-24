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
<<<<<<< HEAD
  // eslint-disable-next-line no-console
  console.log('CORS allowed origins:', allowedOrigins);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(stripSlash(origin))) {
=======
  // Vite auto-increments the dev port (5173 → 5174 → 5175…) whenever a prior
  // `npm run dev` is still holding the previous one, so a hardcoded single
  // port drifts out of sync in local dev. In development only, accept any
  // localhost/127.0.0.1 port instead of maintaining a fixed list; production
  // keeps the strict allowedOrigins check (CLIENT_URL only).
  const isLocalhostOrigin = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  // eslint-disable-next-line no-console
  console.log('CORS allowed origins:', allowedOrigins, process.env.NODE_ENV !== 'production' ? '+ any localhost port (dev)' : '');
  app.use(
    cors({
      origin(origin, callback) {
        const stripped = origin ? stripSlash(origin) : origin;
        const allowed =
          !origin ||
          allowedOrigins.includes(stripped) ||
          (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(stripped));
        if (allowed) {
>>>>>>> 87432db (New Dashboard)
          callback(null, true);
        } else {
          // AppError → the error handler renders a clean 403 instead of a 500.
          callback(new AppError('FORBIDDEN', `Origin not allowed by CORS: ${origin}`, { status: 403 }));
        }
      },
<<<<<<< HEAD
=======
      // Without this, the browser's fetch() can't read Content-Disposition
      // on a cross-origin response (it's not in the default CORS-safelisted
      // header set) — needed so the dashboard export download picks up the
      // server's date-stamped filename instead of falling back to a
      // generic default (V4.8).
      exposedHeaders: ['Content-Disposition'],
>>>>>>> 87432db (New Dashboard)
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
