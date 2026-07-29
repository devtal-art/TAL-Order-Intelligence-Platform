import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────
//  ORDER (V1.2 — new, additive)
//
//  One uploaded HTML email === one Order document. The business identifier is
//  the Portal Order Ref No (`portal_order_ref`, unique) taken from the parsed
//  email; re-uploading the same ref UPSERTS the existing document rather than
//  creating a duplicate.
//
//  This collection stores ONLY order-related information. It intentionally does
//  NOT duplicate Product Catalog data — `resolution_data` holds the order's own
//  resolution results (which merely reference catalog item numbers/names).
// ────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `order_${randomUUID()}` },

    // Primary business identifier (Portal Order Ref No.). `unique` already
    // creates the index — no separate `index: true` needed.
    portal_order_ref: { type: String, required: true, unique: true, trim: true },

    filename: { type: String, default: '' },
    customer_name: { type: String, default: '', index: true },

    // Where this order originated (V3.1 — Manual Order Creation, additive).
    // Orders saved before this field existed simply have it undefined, which
    // reads as 'HTML' everywhere via toDto/toSummaryDto — no backfill needed.
    order_source: { type: String, enum: ['HTML', 'MANUAL'], default: 'HTML' },

    // Team member who processed the order (V1.9). Order-level, plain string —
    // deliberately NOT authentication/user management. '' = Not Assigned
    // (all orders saved before V1.9).
    processed_by: { type: String, default: '', trim: true },
    order_date: { type: String, default: '' },
    upload_timestamp: { type: Date, default: Date.now },
    total_products: { type: Number, default: 0 },

    // Derived from the products' resolution results (see orderService.deriveStatus).
    resolution_status: {
      type: String,
      enum: ['needs_review', 'partially_resolved', 'resolved'],
      default: 'needs_review',
    },

    // Original parsed order data (parseOrderHTML output) and the current
    // resolution snapshot ({ catalogVersion, results }). Stored as-is.
    parsed_data: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolution_data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Per-product fulfilment comment, keyed by the product's lineId (the same
    // String(index + 1) key resolution results use): 'Released' | 'OS' | 'N/A'
    // | 'Not Found' (V2.1 — matching intentionally skipped for this order only).
    // Deliberately a SIBLING of parsed_data/resolution_data — both of those are
    // snapshot blobs that get fully replaced on re-upload/approval, so a value
    // stored inside them would be silently wiped. This field is only ever
    // touched by the comments endpoint.
    product_comments: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Per-product delivery tracking (V1.4), keyed by lineId like
    // product_comments and a sibling for the same wipe-on-reupload reason:
    // { [lineId]: { pendingQty: Number, status: 'delivered' | 'half_delivered'
    // | 'not_delivered' } }. Entries are user-entered and optional — orders
    // saved before V1.4 simply have no entry for any line.
    product_fulfillment: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Per-product free-text "Additional Comment" (V1.7), keyed by lineId and a
    // sibling for the same wipe-on-reupload reason. Completely independent
    // from product_comments (the Released/OS/N/A business status): this holds
    // user-written notes ("Damaged packaging.", "Urgent delivery."). Optional;
    // orders saved before V1.7 simply have no entry for any line.
    product_notes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { versionKey: false, minimize: false }
);

export const Order = mongoose.model('Order', orderSchema);
