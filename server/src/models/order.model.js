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

    // Order Channel (V3.5) — the business-facing source label the Dashboard
    // will bifurcate on (frontend work tracked separately). Deliberately a
    // SEPARATE field from order_source above, not a relabeling of it:
    // order_source is an internal flag several components already switch on
    // (e.g. OrderFinancials.jsx's isManualOrder gate expects exactly 'HTML'/
    // 'MANUAL') and changing its values would silently break that logic.
    // No default — every order gets this set explicitly, either at creation
    // (upsertOrder, derived from the same orderSource input that sets
    // order_source, so it's never guessed or user-selected) or via the
    // one-time migrateOrderChannel.js backfill for pre-existing orders.
    order_channel: { type: String, enum: ['Orders - Email', 'Order - Kumkum'] },

    // Team member who processed the order (V1.9). Order-level, plain string —
    // deliberately NOT authentication/user management. '' = Not Assigned
    // (all orders saved before V1.9).
    processed_by: { type: String, default: '', trim: true },

    // Original processed_by value, preserved when Delete Employee reassigns
    // this order to 'Chat Team' (additive). '' = never reassigned this way.
    // Set exactly once, by employeeService.deleteEmployee, right before it
    // overwrites processed_by — never touched anywhere else — so the order
    // still shows who actually processed it even after that employee's
    // account is gone. (Orders reassigned by an older build, before this
    // field existed, simply have '' here — nothing to recover for those.)
    processed_by_original: { type: String, default: '', trim: true },
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

    // Overall order status (V3.2 — distinct from any per-product status
    // above; 'Unknown' removed V3.3 — every order now carries a real value;
    // 'Order Comments' removed V3.4 — verified zero orders used it before
    // dropping it from the enum; 'Order Released but Half' removed V5.9 —
    // the two orders that used it were migrated back to 'Order Released',
    // which is what they were auto-upgraded from, and the half-release
    // itself is still recorded per line in product_fulfillment). No default:
    // the initial order save
    // (upsertOrder) never sets this field — a separate, mandatory
    // setOrderStatus call sets it immediately after, matching how the
    // API/UI enforce it as required.
    order_status: {
      type: String,
      enum: [
        'Order Released',
        'Order Hold',
        'Order Cancelled',
        'Order Released but Problem',
      ],
    },
    // Free-text comment for the whole order (V3.2) — independent from every
    // per-product comment/reason/note above.
    order_comment: { type: String, default: '', trim: true },

    // Delivery date (V4.2 — additive, user-entered and editable at any time).
    // Deliberately a TOP-LEVEL sibling field, not stored inside parsed_data
    // (unlike the HTML parser, which never captures a delivery date at all,
    // Manual Order Creation used to write it into parsed_data.order_info —
    // but that blob is fully replaced on every re-upload/re-save, which would
    // silently wipe a user's edit). '' = not set yet.
    delivery_date: { type: String, default: '', trim: true },

    // Whether the order's discount was actually provided/applied (Discount
    // Provided toggle — new, additive). Order-level, independent of which
    // discount bucket the order classifies into (that stays fully derived
    // from parsed_data, never stored). Defaults false — every order starts
    // "not provided" until explicitly toggled from the discount list pages.
    discount_provided: { type: Boolean, default: false },

    // Lit Invoice (new, additive) — when true the "Updated (with manual
    // additions)" totals card is shown as "Lit Invoice amount". Display-only
    // label/colour switch; never affects any calculation. Default false.
    lit_invoice: { type: Boolean, default: false },
  },
  { versionKey: false, minimize: false }
);

export const Order = mongoose.model('Order', orderSchema);
