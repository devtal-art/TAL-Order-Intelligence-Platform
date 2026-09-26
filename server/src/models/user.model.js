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

    // 'staff' (full edit), 'viewer' (read-only demo accounts), or 'admin'
    // (manages employees via the admin portal; view-only everywhere else —
    // see authenticate.js's effectiveRole computation).
    role: { type: String, default: 'staff', trim: true },

    // Soft-delete without removing the document. Inactive users cannot log
    // in even if they supply the correct password. Set by the admin
    // portal's Delete action (employeeService.deleteEmployee) — distinct
    // from `disabled` below, which restricts without blocking login.
    active: { type: Boolean, default: true },

    // When this account was soft-deleted (null while active). Set alongside
    // `active: false` by employeeService.deleteEmployee — powers the Admin
    // Portal's Deleted Employees section (sorted most-recently-deleted
    // first). Never set any other way.
    deletedAt: { type: Date, default: null },

    // Admin portal's Enable/Disable toggle (additive). Unlike `active`, a
    // disabled user can still log in — they're just treated as a read-only
    // 'viewer' until re-enabled (see authenticate.js). Independent of
    // `role` so re-enabling restores the account's original permission.
    disabled: { type: Boolean, default: false },

    // Excludes this account from the "Processed By" allowlist (the
    // reassignment dropdown/dashboard processor breakdown) even though it
    // can otherwise log in and process orders — legacy flag, true only for
    // the internal 'Dev Team' account (see scripts/seedUsers.js). Not
    // exposed in the Admin Portal's create/edit forms.
    excludeFromProcessorList: { type: Boolean, default: false },

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
