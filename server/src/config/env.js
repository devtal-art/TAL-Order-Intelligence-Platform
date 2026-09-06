import dotenv from 'dotenv';

dotenv.config();

// Centralized, typed access to environment configuration.
export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // No localhost fallback: an unset MONGODB_URI must fail closed (via the
  // mongoGuard check in db.js) rather than silently connecting elsewhere.
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB || 'order_intelligence',
  // Optional comma-separated DNS servers for Node's resolver (e.g.
  // "8.8.8.8,1.1.1.1"). Some networks (mobile hotspots, VPNs) refuse the SRV
  // queries a mongodb+srv:// URI needs; pointing Node at a public resolver
  // fixes that. Unset → system DNS is used, exactly as before.
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // JWT secret — MUST be set in production via the JWT_SECRET env var.
  // A missing secret in production is flagged at startup; in development a
  // fallback keeps things working but tokens issued with it are insecure.
  jwtSecret: process.env.JWT_SECRET || (() => {
    if ((process.env.NODE_ENV || 'development') === 'production') {
      // eslint-disable-next-line no-console
      console.error('[FATAL] JWT_SECRET env var is not set. Set it before deploying to production.');
    }
    return 'dev-insecure-fallback-secret-do-not-use-in-production';
  })(),

  // Help button — sends via Brevo's transactional email API. No fallback:
  // an unset key means helpService fails closed with a clear error rather
  // than silently no-op'ing (see helpService.js).
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  helpRecipientEmail: process.env.HELP_RECIPIENT_EMAIL || 'dev.talhouse@gmail.com',
};
