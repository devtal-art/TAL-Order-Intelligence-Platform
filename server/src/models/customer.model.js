import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', '3rd Party'];

// ────────────────────────────────────────────────
//  CUSTOMER DELIVERY DAYS (new, additive)
//
//  Orders only carry a customer NAME (order.customer_name) — there has never
//  been a customer collection. This one stores just the weekday(s) a customer
//  is delivered on, keyed by a normalized name so "ACME Ltd" and "acme ltd "
//  are the same customer. Deliberately separate from the Order collection:
//  a customer's delivery days apply to all their orders (old and new) and can
//  be filled in later for existing customers without touching any order.
// ────────────────────────────────────────────────
const customerSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `cust_${randomUUID()}` },
    // Lower-cased, whitespace-collapsed name — the lookup key.
    name_key: { type: String, required: true, unique: true },
    // Name as first entered (display only).
    name: { type: String, default: '', trim: true },
    delivery_days: { type: [{ type: String, enum: WEEKDAYS }], default: [] },
  },
  { versionKey: false, timestamps: true }
);

export const Customer = mongoose.model('Customer', customerSchema);
