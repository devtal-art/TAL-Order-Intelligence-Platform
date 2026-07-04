import dotenv from 'dotenv';

dotenv.config();

// Centralized, typed access to environment configuration.
export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_intelligence',
  mongoDbName: process.env.MONGODB_DB || 'order_intelligence',
};
