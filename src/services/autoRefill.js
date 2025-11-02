// server/src/services/autoRefill.js
import mongoose from "mongoose";
import Item from "../models/Item.js";
import Store from "../models/Store.js";
import Order from "../models/Order.js";

/**
 * runAutoRefill(storeId, { dryRun = false })
 * - Finds items in the store with rackStock <= threshold.
 * - Moves stock from totalStock -> rackStock (up to displayCapacity).
 * - If insufficient totalStock, create an Order for the missing qty.
 */
export async function runAutoRefill(storeId, opts = {}) {
  const { dryRun = false } = opts;
  const session = await mongoose.startSession();
  const summary = { moved: [], orders: [], skipped: [] };

  try {
    session.startTransaction();

    const store = await Store.findById(storeId).session(session).lean();
    if (!store) throw new Error("Store not found");

    if (!store.settings?.autoRefill) {
      await session.abortTransaction();
      session.endSession();
      return { message: "AutoRefill disabled for store", summary };
    }

    const items = await Item.find({ storeId }).session(session);

    for (const item of items) {
      const threshold = item.threshold ?? 0;
      const rackStock = item.rackStock ?? 0;
      const displayCap = item.displayCapacity ?? (threshold * 2 || 20);
      const totalStock = item.totalStock ?? 0;

      if (rackStock > threshold) {
        summary.skipped.push({ itemId: item._id, reason: "above threshold" });
        continue;
      }

      const needed = Math.max(0, displayCap - rackStock);
      const availableToMove = Math.max(0, totalStock - rackStock);
      const moveQty = Math.min(needed, availableToMove);

      if (moveQty > 0) {
        if (!dryRun) {
          item.rackStock += moveQty;
          item.totalStock = Math.max(0, totalStock - moveQty);
          await item.save({ session });
        }
        summary.moved.push({ itemId: item._id, moved: moveQty });
      }

      const stillNeeded = needed - moveQty;
      if (stillNeeded > 0) {
        const orderDoc = {
          storeId,
          itemId: item._id,
          quantity: stillNeeded,
          status: "created",
          note: "Auto-refill order - insufficient totalStock",
        };
        if (!dryRun) {
          const created = await Order.create([orderDoc], { session });
          summary.orders.push({ itemId: item._id, orderId: created[0]._id, qty: stillNeeded });
        } else {
          summary.orders.push({ itemId: item._id, qty: stillNeeded, dryRun: true });
        }
      }
    }

    if (!dryRun) await session.commitTransaction();
    else await session.abortTransaction();

    session.endSession();
    return { message: "AutoRefill run complete", summary };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    console.error("runAutoRefill error:", err);
    throw err;
  }
}
