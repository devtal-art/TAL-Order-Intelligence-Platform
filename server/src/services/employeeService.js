import bcrypt from 'bcrypt';
import { User } from '../models/user.model.js';
import { Order } from '../models/order.model.js';
import { OrderLog } from '../models/orderLog.model.js';
import { AppError } from '../utils/AppError.js';

// ────────────────────────────────────────────────
//  EMPLOYEE SERVICE (Admin Portal — new, additive)
//
//  Employee management for the admin portal: create/enable/disable/delete
//  accounts on the existing User collection. Deliberately excludes 'admin'
//  accounts and the 'Chat Team' account from every operation here — admins
//  aren't managed through this screen, and Chat Team must always stay a
//  valid login/target since Delete reassigns orders to it.
// ────────────────────────────────────────────────

const CHAT_TEAM_NAME = 'Chat Team';
const BCRYPT_ROUNDS = 12; // matches scripts/seedUsers.js

function toEmployeeDto(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    permission: doc.role === 'viewer' ? 'view' : 'edit',
    disabled: Boolean(doc.disabled),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

export async function listEmployees() {
  const docs = await User.find({ active: true, role: { $ne: 'admin' } }).sort({ name: 1 }).lean();
  return docs.map(toEmployeeDto);
}

// Shared by createEmployee and resetEmployeePassword — every employee
// password in the system is now set this way (typed into the admin portal),
// never read from an environment variable. (The one unavoidable exception is
// the bootstrap 'Admin' account itself, seeded once via scripts/seedUsers.js
// before any admin portal exists to create it.)
function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new AppError('VALIDATION_ERROR', 'Password must be at least 6 characters.', {
      status: 400,
      details: [{ field: 'password', issue: 'min 6 characters' }],
    });
  }
}

export async function createEmployee({ name, password, permission }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new AppError('VALIDATION_ERROR', 'Name is required.', {
      status: 400,
      details: [{ field: 'name', issue: 'required' }],
    });
  }
  validatePassword(password);
  if (permission !== 'view' && permission !== 'edit') {
    throw new AppError('VALIDATION_ERROR', 'Permission must be "edit" or "view".', {
      status: 400,
      details: [{ field: 'permission', issue: 'required, one of edit|view' }],
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const doc = await User.create({
      name: trimmedName,
      passwordHash,
      role: permission === 'view' ? 'viewer' : 'staff',
      active: true,
      disabled: false,
    });
    return toEmployeeDto(doc);
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('CONFLICT', `An employee named "${trimmedName}" already exists.`, { status: 409 });
    }
    throw err;
  }
}

// Loads the target employee and enforces the guard shared by every
// operation here: must exist, not be deleted, not be an admin account
// (admins aren't managed through this screen). `blockChatTeam` additionally
// rejects the 'Chat Team' account — used by disable/delete, since it must
// always stay a valid, enabled order-transfer destination; NOT used by
// resetEmployeePassword, which is safe to allow on Chat Team too.
async function loadManageableEmployee(id, { blockChatTeam = false } = {}) {
  const doc = await User.findOne({ _id: id, active: true }).exec();
  if (!doc) {
    throw new AppError('NOT_FOUND', 'Employee not found.', { status: 404 });
  }
  if (doc.role === 'admin') {
    throw new AppError('FORBIDDEN', 'Admin accounts cannot be managed from this screen.', { status: 403 });
  }
  if (blockChatTeam && doc.name === CHAT_TEAM_NAME) {
    throw new AppError('FORBIDDEN', 'The Chat Team account cannot be disabled or deleted.', { status: 403 });
  }
  return doc;
}

export async function setEmployeeDisabled(id, disabled) {
  const doc = await loadManageableEmployee(id, { blockChatTeam: true });
  doc.disabled = Boolean(disabled);
  await doc.save();
  return toEmployeeDto(doc);
}

// Renames an employee and/or changes their access level. A rename
// propagates to every place the OLD name is denormalized as a plain string
// — Order.processed_by and OrderLog.actor — BEFORE the User document itself
// is renamed, so a failure partway through never leaves the User pointing
// at a new name while historical records still show the old one orphaned
// (same before-then-after ordering deleteEmployee uses for its own
// reassignment). The 'Chat Team' account can still have its access level
// changed here, but never its name — CHAT_TEAM_NAME above is a literal
// string this service (and the order-transfer-on-delete feature) depends
// on; renaming it would silently break that account as the delete target.
export async function updateEmployee(id, { name, permission } = {}) {
  const doc = await loadManageableEmployee(id);

  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) {
      throw new AppError('VALIDATION_ERROR', 'Name is required.', {
        status: 400,
        details: [{ field: 'name', issue: 'required' }],
      });
    }
    if (trimmedName !== doc.name) {
      if (doc.name === CHAT_TEAM_NAME) {
        throw new AppError('FORBIDDEN', 'The Chat Team account cannot be renamed.', { status: 403 });
      }
      const oldName = doc.name;
      await Order.updateMany({ processed_by: oldName }, { $set: { processed_by: trimmedName } });
      await OrderLog.updateMany({ actor: oldName }, { $set: { actor: trimmedName } });
      doc.name = trimmedName;
    }
  }

  if (permission !== undefined) {
    if (permission !== 'view' && permission !== 'edit') {
      throw new AppError('VALIDATION_ERROR', 'Permission must be "edit" or "view".', {
        status: 400,
        details: [{ field: 'permission', issue: 'required, one of edit|view' }],
      });
    }
    doc.role = permission === 'view' ? 'viewer' : 'staff';
  }

  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('CONFLICT', `An employee named "${doc.name}" already exists.`, { status: 409 });
    }
    throw err;
  }
  return toEmployeeDto(doc);
}

// Sets a new password for an existing employee — the admin-portal-only path
// for changing anyone's password after creation (see validatePassword above).
export async function resetEmployeePassword(id, password) {
  validatePassword(password);
  const doc = await loadManageableEmployee(id);
  doc.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await doc.save();
  return toEmployeeDto(doc);
}

// Delete = soft-delete (active:false, blocks login) + reassign every order
// this employee processed to Chat Team. Reassignment happens BEFORE the
// account is marked inactive so a failure here leaves the employee fully
// intact (still enabled) rather than deleted-but-not-transferred.
//
// processed_by_original is stamped with the employee's name in the SAME
// update as the processed_by overwrite, so the order still shows who
// actually processed it (client renders it struck through next to 'Chat
// Team') even though the User document itself no longer appears anywhere
// this name is looked up live. Safe to set unconditionally here: an order
// only ever matches { processed_by: doc.name } once, since processed_by is
// otherwise immutable (orderService.setProcessedBy) and Chat Team itself can
// never be deleted (blockChatTeam above) — so this can't run twice for the
// same order.
export async function deleteEmployee(id) {
  const doc = await loadManageableEmployee(id, { blockChatTeam: true });

  const { modifiedCount } = await Order.updateMany(
    { processed_by: doc.name },
    { $set: { processed_by: CHAT_TEAM_NAME, processed_by_original: doc.name } }
  );

  doc.active = false;
  doc.deletedAt = new Date();
  await doc.save();

  return { reassignedOrders: modifiedCount };
}

function toDeletedEmployeeDto(doc, reassignedOrders) {
  return {
    id: String(doc._id),
    name: doc.name,
    deletedAt: doc.deletedAt instanceof Date ? doc.deletedAt.toISOString() : doc.deletedAt,
    reassignedOrders,
  };
}

// Admin Portal's Deleted Employees section — every soft-deleted (active:
// false) non-admin account, most-recently-deleted first, alongside how many
// orders it transferred to Chat Team on delete (counted via
// processed_by_original, the only surviving trace of the pre-delete name —
// see the schema comment on Order.processed_by_original). Accounts deleted
// by an older build (before that field existed) simply show 0 here; nothing
// to recover for those.
export async function listDeletedEmployees() {
  const docs = await User.find({ active: false, role: { $ne: 'admin' } }).sort({ deletedAt: -1 }).lean();
  if (!docs.length) return [];

  const counts = await Order.aggregate([
    { $match: { processed_by_original: { $in: docs.map((d) => d.name) } } },
    { $group: { _id: '$processed_by_original', count: { $sum: 1 } } },
  ]);
  const countByName = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  return docs.map((doc) => toDeletedEmployeeDto(doc, countByName[doc.name] || 0));
}
