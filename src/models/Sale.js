// server/src/models/Sale.js
import mongoose from 'mongoose';

const SaleSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true }
}, { timestamps: true });

export default mongoose.model('Sale', SaleSchema);
