import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────
//  ORDER LOG (Order Activity Log — new, additive)
//
//  One document per order mutation: who (actor, from the JWT — never
//  client-supplied), what (action + human-readable message), and when.
//  A separate collection from Order (like User) rather than an embedded
//  array, so the already-heavy Order document (parsed_data/resolution_data)
//  never grows an unbounded history and every getOrder/dashboard read stays
//  cheap. Write-only from the mutation call sites; never edited or deleted.
// ────────────────────────────────────────────────
const orderLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `log_${randomUUID()}` },

    portal_order_ref: { type: String, required: true, index: true },

    action: {
      type: String,
      required: true,
      enum: [
        'order_created',
        'order_reuploaded',
        'product_added',
        'product_removed',
        'manual_order_created',
        'order_status_set',
        'delivery_date_set',
        'processed_by_set',
        'product_comment_set',
        'product_fulfillment_set',
        'product_note_set',
        'product_resolution_updated',
        'discount_provided_set',
      ],
    },

    // Who performed the action — always req.user.name from the verified JWT,
    // never accepted from the request body.
    actor: { type: String, required: true, trim: true },
    actor_role: { type: String, default: '', trim: true },

    // Precomputed at write time so display never needs to reconstruct
    // formatting logic later — mirrors how Order DTOs are shaped server-side.
    message: { type: String, required: true, trim: true },

    // Structured data behind the message (old/new values, changed lineIds).
    details: { type: mongoose.Schema.Types.Mixed, default: {} },

    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, minimize: false }
);

export const OrderLog = mongoose.model('OrderLog', orderLogSchema);
