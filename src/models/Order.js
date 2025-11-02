// server/src/models/Order.js
import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    quantity: { type: Number, required: true },
    status: { type: String, default: "created" }, // created | placed | received
    note: String,
  },
  { timestamps: true }
);

export default mongoose.model("Order", OrderSchema);
