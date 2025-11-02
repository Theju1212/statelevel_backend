// models/Store.js
import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    currency: { type: String, default: "INR" },
    settings: {
      autoRefill: { type: Boolean, default: false },
      notificationEmail: { type: String },
      notificationPhone: { type: String },
      lastAlertCopy: { type: String },
      lastAlertDate: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Store", StoreSchema);
