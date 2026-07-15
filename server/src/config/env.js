import dotenv from 'dotenv';

dotenv.config();

// Centralized, typed access to environment configuration.
export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_intelligence',
  mongoDbName: process.env.MONGODB_DB || 'order_intelligence',
  // Optional comma-separated DNS servers for Node's resolver (e.g.
  // "8.8.8.8,1.1.1.1"). Some networks (mobile hotspots, VPNs) refuse the SRV
  // queries a mongodb+srv:// URI needs; pointing Node at a public resolver
  // fixes that. Unset → system DNS is used, exactly as before.
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
