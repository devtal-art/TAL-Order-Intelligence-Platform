import mongoose from 'mongoose';

// Product catalog entry. One document per row of the uploaded Website Product CSV.
// The whole collection is replaced on each catalog upload.
const productSchema = new mongoose.Schema(
  {
    item_no: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Optional "Option" column from the website sheet (pack/variant, e.g.
    // "Box10"). Display-only: shown as "Name (Option)"; never used for
    // matching or normalization.
    option: { type: String, default: '', trim: true },
    normalized_name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Lookups will be by normalized name (future matching) and by item number.
productSchema.index({ normalized_name: 1 });
productSchema.index({ item_no: 1 });

export const Product = mongoose.model('Product', productSchema);
