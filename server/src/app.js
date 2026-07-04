import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { router } from './routes/index.js';
import { v1Router } from './routes/v1/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

// Builds and configures the Express application. Kept separate from index.js so
// it can be imported by tests later without starting a listener.
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestId);

  app.use('/api', router); // unversioned infra alias (/api/health)
  app.use('/api/v1', v1Router); // versioned API

  // Fallbacks — must be registered last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
