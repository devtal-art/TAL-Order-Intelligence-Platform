import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

// A human-confirmed link from an email product name to a website item number.
// `normalized_email_name` is unique — it guarantees the "found → instant 100%"
// fast path and prevents duplicate approvals for the same email product.
//
// The _id is a contract-style prefixed string ("map_...") so it can be used
// directly as the :id path param.
const approvedMappingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `map_${randomUUID()}` },
    email_product_name: { type: String, required: true, trim: true },
    normalized_email_name: { type: String, required: true, unique: true },
    website_product_name: { type: String, required: true, trim: true },
    item_no: { type: String, required: true, trim: true },
    approved_by: { type: String, default: 'system' },
    approved_date: { type: Date, default: Date.now },
    times_used: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { versionKey: false }
);

export const ApprovedMapping = mongoose.model('ApprovedMapping', approvedMappingSchema);
