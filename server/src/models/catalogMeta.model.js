import mongoose from 'mongoose';

// Metadata about the currently active catalog. Needed to satisfy the frozen
// contract's response shapes (version / filename / uploadedBy / uploadedAt).
// A single document represents the active catalog; it is replaced on each upload.
const catalogMetaSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    filename: { type: String, required: true },
    productCount: { type: Number, required: true },
    uploadedBy: { type: String, default: 'system' },
    uploadedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'active' },
  },
  { versionKey: false }
);

export const CatalogMeta = mongoose.model('CatalogMeta', catalogMetaSchema);
