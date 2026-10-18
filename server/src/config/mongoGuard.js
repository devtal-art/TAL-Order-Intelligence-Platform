// Fail-closed database-target guard. Every MongoDB entry point (the server
// and the standalone scripts) must call this before connecting.
//
// Deliberately a positive allowlist of the intended Atlas cluster/database —
// not a denylist of any other host — so no old-database reference needs to
// exist anywhere in this codebase for the guard to work.
const EXPECTED_MONGO_HOST = 'cluster1.lsl5b06.mongodb.net';
const EXPECTED_MONGO_DB = 'order_intelligence';

export function assertExpectedMongoTarget(uri, dbName) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Refusing to connect: no fallback database target is allowed.'
    );
  }

  let host;
  try {
    host = new URL(uri).host;
  } catch {
    throw new Error('MONGODB_URI is not a valid connection string.');
  }

  if (host !== EXPECTED_MONGO_HOST) {
    throw new Error(
      `Refusing to connect: MongoDB host "${host}" does not match the expected cluster "${EXPECTED_MONGO_HOST}".`
    );
  }

  if (dbName !== EXPECTED_MONGO_DB) {
    throw new Error(
      `Refusing to connect: database name "${dbName}" does not match the expected database "${EXPECTED_MONGO_DB}".`
    );
  }

  return { host, dbName };
}
