/**
 * One-off credential update script — NOT part of the normal seed flow.
 *
 * Unlike scripts/seedUsers.js (which only creates missing users and never
 * touches existing ones), this script:
 *   1. Updates the passwordHash of the 4 existing users to new passwords.
 *   2. Creates the new user "Sehbaz" if it does not already exist.
 *
 * It touches ONLY the `passwordHash` field on existing users — name, role,
 * active, and _id are left untouched. Hashing uses the same bcrypt call and
 * cost factor (12 rounds) as seedUsers.js, so the stored hashes are produced
 * by the identical method the rest of the app already relies on.
 *
 * Usage:
 *   node scripts/updateUserCredentials.js
 *
 * Safe to re-run: existing users are updated (not duplicated), and the
 * Sehbaz creation step is skipped if that user already exists.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

// ── Inline User schema (mirrors seedUsers.js / models/user.model.js) ───────
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

const BCRYPT_ROUNDS = 12; // Same cost factor used by seedUsers.js

// ── Existing users to update (password only) ────────────────────────────────
const USERS_TO_UPDATE = [
  { name: 'Sahil',   password: process.env.SEED_PASSWORD_SAHIL },
  { name: 'Jasmeet', password: process.env.SEED_PASSWORD_JASMEET },
  { name: 'Shubham', password: process.env.SEED_PASSWORD_SHUBHAM },
  { name: 'Alpa',    password: process.env.SEED_PASSWORD_ALPA },
];

// ── New user to create (same process/role/hashing as existing users) ───────
const NEW_USER = { name: 'Sehbaz', password: process.env.SEED_PASSWORD_SEHBAZ, role: 'staff' };

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_intelligence';
  const mongoDbName = process.env.MONGODB_DB || 'order_intelligence';

  console.log(`\n🔗 Connecting to MongoDB (db: ${mongoDbName})…`);

  const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    const { default: dns } = await import('dns');
    dns.setServers(dnsServers);
    console.log(`   DNS override: ${dnsServers.join(', ')}`);
  }

  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected.\n');

  let updated = 0;
  let missing = 0;

  for (const user of USERS_TO_UPDATE) {
    if (!user.password) {
      console.log(`   ⏭️  ${user.name} — skipped (no password provided in environment variables).`);
      continue;
    }

    const existing = await User.findOne({ name: user.name });
    if (!existing) {
      console.log(`   ⚠️  ${user.name} — no existing user found, nothing updated.`);
      missing++;
      continue;
    }

    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    await User.updateOne({ _id: existing._id }, { $set: { passwordHash } });
    console.log(`   ✅ ${user.name} — password updated.`);
    updated++;
  }

  // Create the new user, following the exact same process as seedUsers.js.
  if (!NEW_USER.password) {
    console.log(`   ⏭️  ${NEW_USER.name} — skipped (no password provided in environment variables).`);
  } else {
    const existingNewUser = await User.findOne({ name: NEW_USER.name }).lean();
    if (existingNewUser) {
      console.log(`   ⏭️  ${NEW_USER.name} — already exists, skipping creation.`);
    } else {
      const passwordHash = await bcrypt.hash(NEW_USER.password, BCRYPT_ROUNDS);
      await User.create({ name: NEW_USER.name, passwordHash, role: NEW_USER.role, active: true });
      console.log(`   ✅ ${NEW_USER.name} — created.`);
    }
  }

  console.log(`\n📊 Summary: ${updated} password(s) updated, ${missing} user(s) not found.\n`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.\n');
}

main().catch((err) => {
  console.error('\n❌ Update failed:', err.message);
  process.exit(1);
});
