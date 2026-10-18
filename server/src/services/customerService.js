import { Customer, WEEKDAYS } from '../models/customer.model.js';
import { AppError } from '../utils/AppError.js';

// Same customer regardless of case / stray whitespace.
export function customerKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Keeps only valid weekday names, de-duplicated, in Monday→Sunday order.
export function normalizeDays(days) {
  const set = new Set(Array.isArray(days) ? days : []);
  return WEEKDAYS.filter((d) => set.has(d));
}

// { exists, deliveryDays } — exists=false means this customer has never had
// delivery days assigned (a "new" customer as far as this feature goes).
export async function getDeliveryDays(name) {
  const key = customerKey(name);
  if (!key) return { exists: false, deliveryDays: [] };
  const doc = await Customer.findOne({ name_key: key }).lean();
  const deliveryDays = doc ? normalizeDays(doc.delivery_days) : [];
  return { exists: deliveryDays.length > 0, deliveryDays };
}

// Create or replace a customer's delivery days. At least one day is required.
export async function setDeliveryDays(name, days) {
  const key = customerKey(name);
  if (!key) {
    throw new AppError('VALIDATION_ERROR', 'Customer name is required.', { status: 400 });
  }
  if (Array.isArray(days) && days.some((d) => !WEEKDAYS.includes(d))) {
    throw new AppError('VALIDATION_ERROR', 'Delivery days must be weekday names (Monday–Sunday).', { status: 400 });
  }
  const deliveryDays = normalizeDays(days);
  if (!deliveryDays.length) {
    throw new AppError('VALIDATION_ERROR', 'Select at least one delivery day.', { status: 400 });
  }
  await Customer.findOneAndUpdate(
    { name_key: key },
    { $set: { delivery_days: deliveryDays }, $setOnInsert: { name_key: key, name: String(name).trim() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { exists: true, deliveryDays };
}
