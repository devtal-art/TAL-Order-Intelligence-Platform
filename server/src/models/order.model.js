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

    // Primary business identifier (Portal Order Ref No.).
    portal_order_ref: { type: String, required: true, unique: true, trim: true, index: true },

    filename: { type: String, default: '' },
    customer_name: { type: String, default: '' },
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
  },
  { versionKey: false, minimize: false }
);

export const Order = mongoose.model('Order', orderSchema);
