import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { assertExpectedMongoTarget } from './mongoGuard.js';

// Connects to MongoDB. Callers decide how to handle failure; the server boots
// regardless so the health endpoint stays available, and DB-backed routes
// return 503 until a connection is established.
export async function connectDB() {
  const { host } = assertExpectedMongoTarget(env.mongoUri, env.mongoDbName);

  // Node resolves mongodb+srv:// hosts with its own resolver (not the OS one),
  // and some networks' DNS (mobile hotspots, VPNs) refuse those SRV queries.
  // DNS_SERVERS overrides the resolver for this process only; unset → no change.
  if (env.dnsServers.length) {
    dns.setServers(env.dnsServers);
    // eslint-disable-next-line no-console
    console.log(`DNS override active for Node resolver: ${env.dnsServers.join(', ')}`);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    serverSelectionTimeoutMS: 15000,
  });
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected — host: ${host}, db: ${env.mongoDbName}`);
}
