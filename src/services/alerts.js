import Item from "../models/Item.js";
import { askLLM } from "./ai.js";

export async function buildLowStockAlerts(storeId) {
  const items = await Item.find({ store: storeId, rackStock: { $lte: 5 } }); // <= threshold
  if (!items.length) return ["✅ All racks are well-stocked."];

  const itemList = items.map(i => `${i.name} (rack: ${i.rack}, stock: ${i.rackStock}/${i.displayCapacity})`).join(", ");
  const prompt = `Generate short alerts for these low-stock items: ${itemList}. Keep it concise and actionable.`;

  const response = await askLLM(prompt);
  return [response];
}
