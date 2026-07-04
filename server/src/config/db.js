import mongoose from 'mongoose';
import { env } from './env.js';

// Connects to MongoDB. Callers decide how to handle failure; the server boots
// regardless so the health endpoint stays available, and DB-backed routes
// return 503 until a connection is established.
export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    serverSelectionTimeoutMS: 15000,
  });
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected (db: ${env.mongoDbName})`);
}
