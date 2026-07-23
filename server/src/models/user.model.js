import mongoose from 'mongoose';

// ────────────────────────────────────────────────
//  USER (V3.0 — Authentication)
//
//  Internal users only. No self-registration. Seeded once via
//  scripts/seedUsers.js. Passwords are stored as bcrypt hashes —
//  the plain-text value is never persisted or returned.
// ────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    // Display name — used as the JWT `name` claim and as the order's
    // processedBy value. Kept as the natural key (no UUID) so the four known
    // names are human-readable throughout the system.
    name: { type: String, required: true, unique: true, trim: true },

    // bcrypt hash of the user's password. Never exposed in any API response.
    passwordHash: { type: String, required: true },

    // Simple role field reserved for future RBAC. All current users are 'staff'.
    role: { type: String, default: 'staff', trim: true },

    // Soft-delete / disable without removing the document. Inactive users
    // cannot log in even if they supply the correct password.
    active: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now },
  },
  {
    // Never auto-add __v — stays consistent with the Order model convention.
    versionKey: false,
    // passwordHash must never leak into serialized output.
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const User = mongoose.model('User', userSchema);
