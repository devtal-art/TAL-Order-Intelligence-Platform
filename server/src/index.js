import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

// Server entry point. Boots the Express app and starts listening.
const app = createApp();

// Connect to MongoDB in the background. Failure is non-fatal: the server still
// listens (health stays up); DB-backed routes return 503 until connected.
connectDB().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`MongoDB connection failed: ${err.message}`);
  // Diagnostics: reveal the real cause the generic driver message hides.
  try {
    const host = new URL(env.mongoUri).host;
    // eslint-disable-next-line no-console
    console.error(`  → connecting to host: ${host}  (URI came from env: ${Boolean(process.env.MONGODB_URI)})`);
  } catch {
    /* ignore URI parse errors */
  }
  // eslint-disable-next-line no-console
  if (err.reason) console.error('  → underlying reason:', err.reason);
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Order Intelligence API started successfully on port ${env.port} (${env.nodeEnv})`);
});
