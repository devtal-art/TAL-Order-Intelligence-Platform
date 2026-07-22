/**
 * migrate-na-to-notfound.mjs
 * One-time migration: replaces every 'N/A' value in product_comments with 'Not Found'.
 *
 * Run from the server directory:
 *   node scripts/migrate-na-to-notfound.mjs
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env from server root
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

// Apply the same DNS override the server uses so Atlas SRV lookups succeed.
import dns from 'dns';
const dnsOverride = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map(s => s.trim());
dns.setServers(dnsOverride);

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_intelligence';
const MONGO_DB   = process.env.MONGODB_DB  || 'order_intelligence';

await mongoose.connect(MONGO_URI, { dbName: MONGO_DB, serverSelectionTimeoutMS: 15000 });
console.log(`Connected to MongoDB — db: ${MONGO_DB}`);

const db = mongoose.connection.db;
const collection = db.collection('orders');

// Since product_comments is a dynamic object ({ [lineId]: value }), we
// fetch all docs and update in JS (MongoDB can't query dynamic key values directly).
const cursor = collection.find({});

let ordersScanned = 0;
let ordersUpdated = 0;
let fieldsUpdated = 0;

for await (const doc of cursor) {
  ordersScanned++;
  const comments = doc.product_comments;
  if (!comments || typeof comments !== 'object' || Array.isArray(comments)) continue;

  const updates = {};
  for (const [lineId, value] of Object.entries(comments)) {
    if (value === 'N/A') {
      updates[`product_comments.${lineId}`] = 'Not Found';
      fieldsUpdated++;
    }
  }

  if (Object.keys(updates).length > 0) {
    await collection.updateOne({ _id: doc._id }, { $set: updates });
    console.log(`  Updated order ${doc.portal_order_ref} (${Object.keys(updates).length} line(s) changed)`);
    ordersUpdated++;
  }
}

console.log(`\nMigration complete.`);
console.log(`  Orders scanned : ${ordersScanned}`);
console.log(`  Orders updated : ${ordersUpdated}`);
console.log(`  Fields changed : ${fieldsUpdated}`);

await mongoose.disconnect();
