import { Readable } from 'stream';
import archiver from 'archiver';
import mongoose from 'mongoose';
import { Order } from '../models/order.model.js';
import { OrderLog } from '../models/orderLog.model.js';
import { Product } from '../models/product.model.js';
import { Customer } from '../models/customer.model.js';
import { ApprovedMapping } from '../models/approvedMapping.model.js';
import { User } from '../models/user.model.js';
import { CatalogMeta } from '../models/catalogMeta.model.js';
import { env } from '../config/env.js';

// Database backup (Admin Portal — new, additive, strictly read-only).
//
// Streams a .zip of the database this server is currently connected to. The
// database, its collections and their indexes are all discovered at request
// time from the live connection — nothing is hardcoded — so the same code
// backs up staging or live depending only on MONGODB_URI / MONGODB_DB.
//
// Zip layout:
//   <collection>.json          — every document, MongoDB Extended JSON (so
//                                ObjectIds / Dates keep their types)
//   <collection>.indexes.json  — the collection's index definitions
//   manifest.json              — database name, timestamp, per-collection counts

const { EJSON } = mongoose.mongo.BSON;

const pad = (n) => String(n).padStart(2, '0');

// <db>-backup-YYYY-MM-DD_HH-mm.zip (server local time).
export function backupFilename(dbName, now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${dbName}-backup-${date}_${time}.zip`;
}

// Lazily yields a JSON array of a collection's documents, one doc at a time,
// so a large collection is never held in memory. `counter.count` ends up as
// the number of documents written.
async function* collectionJson(collection, counter) {
  yield '[';
  for await (const doc of collection.find({})) {
    yield (counter.count === 0 ? '\n' : ',\n') + EJSON.stringify(doc, { relaxed: false });
    counter.count += 1;
  }
  yield counter.count === 0 ? ']' : '\n]';
}

// Lists the real collections (no views, no system.* internals) up front, so a
// connection problem surfaces as a normal JSON error before any bytes of the
// zip have been sent.
export async function listBackupCollections() {
  const db = mongoose.connection.db;
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();
  return infos
    .filter((c) => c.type === 'collection' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();
}

// Pipes the zip into `res`. Resolves when the archive has been fully written;
// rejects if anything fails mid-stream (the caller then aborts the response).
export async function streamBackupZip(res, collectionNames) {
  const db = mongoose.connection.db;
  const archive = archiver('zip', { zlib: { level: 6 } });

  const done = new Promise((resolve, reject) => {
    archive.on('error', reject);
    res.on('close', () => reject(new Error('Client closed the connection before the backup finished.')));
    res.on('finish', resolve);
  });
  archive.pipe(res);

  // archiver writes queued entries strictly one after another, so the lazy
  // manifest below is only read once every collection entry before it has
  // been fully consumed — its counts are final by then.
  const counters = {};
  for (const name of collectionNames) {
    const collection = db.collection(name);
    counters[name] = { count: 0 };
    archive.append(Readable.from(collectionJson(collection, counters[name])), { name: `${name}.json` });
    const indexes = await collection.indexes();
    archive.append(JSON.stringify(indexes, null, 2), { name: `${name}.indexes.json` });
  }

  const manifest = {};
  archive.append(
    Readable.from(
      (async function* () {
        manifest.database = db.databaseName;
        manifest.createdAt = new Date().toISOString();
        manifest.format = 'MongoDB Extended JSON (canonical), one array per collection';
        manifest.collections = Object.fromEntries(Object.entries(counters).map(([n, c]) => [n, c.count]));
        yield JSON.stringify(manifest, null, 2);
      })()
    ),
    { name: 'manifest.json' }
  );

  await archive.finalize();
  await done;
  return manifest;
}

// ── Pre-backup summary ────────────────────────────────────────────────────
// Read-only snapshot of what a backup taken right now would contain, so the
// admin can sanity-check it against what they expect before downloading.
// Collections are discovered dynamically (same list the backup uses); the
// "highlights" are derived from the app's own models.

const COLLECTION_LABELS = {
  [Order.collection.name]: 'Orders',
  [OrderLog.collection.name]: 'Activity log entries',
  [Product.collection.name]: 'Products (catalog)',
  [Customer.collection.name]: 'Customers',
  [ApprovedMapping.collection.name]: 'Approved product mappings',
  [User.collection.name]: 'User accounts',
  [CatalogMeta.collection.name]: 'Catalog metadata',
};

// Short clarifications shown under a collection's tile on the Backup screen.
const COLLECTION_NOTES = {
  [Customer.collection.name]:
    'Delivery-day settings only (customers who have had delivery days set) — not the full list of customers on orders.',
};

// Uncompressed data size of a collection in bytes, or null where the server
// doesn't expose storage stats (e.g. some shared Atlas tiers).
async function collectionSize(collection) {
  try {
    const [stats] = await collection.aggregate([{ $collStats: { storageStats: {} } }]).toArray();
    return stats?.storageStats?.size ?? null;
  } catch {
    return null;
  }
}

export async function getBackupSummary() {
  const db = mongoose.connection.db;
  const names = await listBackupCollections();

  const collections = await Promise.all(
    names.map(async (name) => {
      const collection = db.collection(name);
      const [documents, sizeBytes] = await Promise.all([collection.countDocuments({}), collectionSize(collection)]);
      return { name, label: COLLECTION_LABELS[name] || name, note: COLLECTION_NOTES[name] || null, documents, sizeBytes };
    })
  );

  const [byStatus, byChannel, orderDates, lastActivity, userCounts] = await Promise.all([
    Order.aggregate([{ $group: { _id: '$order_status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $group: { _id: '$order_channel', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $group: { _id: null, first: { $min: '$upload_timestamp' }, last: { $max: '$upload_timestamp' } } },
    ]),
    OrderLog.findOne({}, { created_at: 1 }).sort({ created_at: -1 }).lean(),
    User.aggregate([{ $group: { _id: { active: '$active', role: '$role' }, count: { $sum: 1 } } }]),
  ]);

  const tally = (rows) =>
    rows
      .map((r) => ({ label: r._id || 'Not set', count: r.count }))
      .sort((a, b) => b.count - a.count);

  const accounts = userCounts.reduce(
    (acc, r) => {
      if (r._id.active === false) acc.deleted += r.count;
      else if (r._id.role === 'admin') acc.admins += r.count;
      else acc.employees += r.count;
      return acc;
    },
    { admins: 0, employees: 0, deleted: 0 }
  );

  return {
    database: db.databaseName,
    host: clusterHost(),
    generatedAt: new Date().toISOString(),
    totalDocuments: collections.reduce((n, c) => n + c.documents, 0),
    totalSizeBytes: collections.every((c) => c.sizeBytes != null)
      ? collections.reduce((n, c) => n + c.sizeBytes, 0)
      : null,
    collections,
    orders: {
      total: collections.find((c) => c.name === Order.collection.name)?.documents ?? 0,
      byStatus: tally(byStatus),
      byChannel: tally(byChannel),
      firstUploadedAt: orderDates[0]?.first ?? null,
      lastUploadedAt: orderDates[0]?.last ?? null,
    },
    lastActivityAt: lastActivity?.created_at ?? null,
    accounts,
  };
}

// Cluster host from the configured connection string, partially masked
// (e.g. clus****j3a******.net) — enough for an admin to tell environments
// apart without the full hostname ever being sent to the browser. Falls back
// to the driver-reported host if the URI can't be parsed.
function clusterHost() {
  let host;
  try {
    host = new URL(env.mongoUri).host;
  } catch {
    host = mongoose.connection.host || '';
  }
  return maskHost(host);
}

function maskHost(host) {
  if (host.length < 16) return host ? `${host.slice(0, 2)}****${host.slice(-2)}` : '';
  const mid = Math.floor(host.length / 2) - 3;
  return `${host.slice(0, 4)}****${host.slice(mid, mid + 3)}******${host.slice(-4)}`;
}
