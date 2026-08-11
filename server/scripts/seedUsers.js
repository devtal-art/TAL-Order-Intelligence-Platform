/**
 * Seed script — creates the four internal users in MongoDB if they do not
 * already exist.
 *
 * Usage:
 *   node scripts/seedUsers.js
 *
 * The script reads the same .env file as the main server (dotenv.config()
 * is called before anything else). It connects to MongoDB, checks for each
 * user by name, creates any that are missing with a bcrypt-hashed password,
 * and exits cleanly.
 *
 * Run this once after initial deployment and whenever you add new users.
 * It is idempotent — running it multiple times is always safe.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Resolve .env relative to the server root (one level up from /scripts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

// ── Inline User schema (avoids depending on the compiled app module graph) ──
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'staff', trim: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const User = mongoose.model('User', userSchema);

// ── Users to seed ────────────────────────────────────────────────────────────
// IMPORTANT: Do NOT add plain-text passwords to this file in a production
// environment — use environment variables or a secrets manager. The
// passwords here are the initial values as specified in the platform
// requirements.
const USERS_TO_SEED = [
  { name: 'Jasmeet',   password: process.env.SEED_PASSWORD_JASMEET,   role: 'staff' },
  { name: 'Sahil',     password: process.env.SEED_PASSWORD_SAHIL,     role: 'staff' },
  { name: 'Shubham',   password: process.env.SEED_PASSWORD_SHUBHAM,   role: 'staff' },
  { name: 'Alpa',      password: process.env.SEED_PASSWORD_ALPA,      role: 'staff' },
  { name: 'Sehbaz',    password: process.env.SEED_PASSWORD_SEHBAZ,    role: 'staff' },
  { name: 'Shashwat',  password: process.env.SEED_PASSWORD_SHASHWAT,  role: 'staff' },
  // Read-only demo account (V?.?) — server-side write-blocking is enforced by
  // blockViewerWrites middleware based on this role; the client also hides
  // every edit control for it. See server/src/middleware/blockViewerWrites.js.
  { name: 'Gagandeep', password: process.env.SEED_PASSWORD_GAGANDEEP, role: 'viewer' },
];

const BCRYPT_ROUNDS = 12; // OWASP minimum recommendation for 2024

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_intelligence';
  const mongoDbName = process.env.MONGODB_DB || 'order_intelligence';

  console.log(`\n🔗 Connecting to MongoDB (db: ${mongoDbName})…`);

  // Apply DNS override if configured (mirrors the main server's logic).
  const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    const { default: dns } = await import('dns');
    dns.setServers(dnsServers);
    console.log(`   DNS override: ${dnsServers.join(', ')}`);
  }

  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected.\n');

  let created = 0;
  let skipped = 0;

  for (const user of USERS_TO_SEED) {
    if (!user.password) {
      console.log(`   ⏭️  ${user.name} — skipped (no password provided in environment variables).`);
      skipped++;
      continue;
    }

    const existing = await User.findOne({ name: user.name }).lean();
    if (existing) {
      console.log(`   ⏭️  ${user.name} — already exists, skipping.`);
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    await User.create({ name: user.name, passwordHash, role: user.role, active: true });
    console.log(`   ✅ ${user.name} — created.`);
    created++;
  }

  console.log(`\n📊 Summary: ${created} created, ${skipped} skipped.\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
