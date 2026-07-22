import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGO_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);
const cols = await mongoose.connection.db.listCollections().toArray();
console.log('Collections:', cols.map(c => c.name));
await mongoose.disconnect();
