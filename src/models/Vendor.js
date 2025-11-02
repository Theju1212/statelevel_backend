// server/src/models/Vendor.js
import mongoose from 'mongoose';

const VendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactEmail: { type: String },
  phone: { type: String },
  leadTimeDays: { type: Number, default: 3 },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('Vendor', VendorSchema);
