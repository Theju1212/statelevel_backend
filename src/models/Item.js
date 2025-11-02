import mongoose from 'mongoose';
import Sale from './Sale.js';

const ItemSchema = new mongoose.Schema({
  storeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Store', 
    required: true 
  },
  storeType: { type: String, enum: ['Kirana', 'General'], default: 'Kirana' },
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  rack: { type: String, default: 'R1' },
  totalStock: { type: Number, default: 0 },
  rackStock: { type: Number, default: 0 },
  threshold: { type: Number, default: 10 },
  displayCapacity: { type: Number, default: 20 },
  autoRefill: { type: Boolean, default: true },
  expiryDate: { type: Date, default: null },
  userCreated: { type: Boolean, default: true },

  // Discount fields
  discountPercent: { type: Number, default: 0 },
  discountQty: { type: Number, default: 0 },
}, { timestamps: true });

// Unique per store + sku
ItemSchema.index({ storeId: 1, sku: 1 }, { unique: true });

ItemSchema.pre('remove', async function (next) {
  try {
    await Sale.deleteMany({ itemId: this._id });
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('Item', ItemSchema);