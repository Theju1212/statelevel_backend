import Item from "../models/Item.js";
import Sale from "../models/Sale.js";
import { askLLM } from "./ai.js";

export async function buildRecommendations(itemId, storeId) {
  const item = await Item.findOne({ _id: itemId, store: storeId });
  if (!item) return "❌ Item not found.";

  const sales = await Sale.find({ item: itemId }).sort({ createdAt: -1 }).limit(7);
  const salesData = sales.map(s => s.quantity).reverse(); // last 7 sales

  const prompt = `
  Item: ${item.name}
  Current totalStock: ${item.totalStock}, rackStock: ${item.rackStock}
  Sales (last ${salesData.length} records): ${salesData.join(", ")}
  Suggest reorder quantity and reasoning in 2 sentences.
  `;

  return await askLLM(prompt);
}
