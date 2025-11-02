import express from "express";
import Sale from "../models/Sale.js";
import Item from "../models/Item.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// 📈 Sales Trend (last 7 days)
router.get("/sales-trend", async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const sales = await Sale.find({
      storeId: req.storeId,
      createdAt: { $gte: since }
    }).populate("itemId", "name");

    // Aggregate by date
    const trendMap = {};
    for (const s of sales) {
      const d = new Date(s.createdAt).toISOString().slice(0, 10);
      trendMap[d] = (trendMap[d] || 0) + s.quantity;
    }

    const trend = Object.entries(trendMap)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(trend);
  } catch (err) {
    console.error("GET /analytics/sales-trend error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🏆 Top-selling items (last 7 days)
router.get("/top-items", async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const sales = await Sale.find({
      storeId: req.storeId,
      createdAt: { $gte: since }
    }).populate("itemId", "name");

    const totals = {};
    for (const s of sales) {
      if (!s.itemId) continue;
      totals[s.itemId.name] = (totals[s.itemId.name] || 0) + s.quantity;
    }

    const sorted = Object.entries(totals)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    res.json(sorted);
  } catch (err) {
    console.error("GET /analytics/top-items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🧃 Lowest Stock item
router.get("/lowest-stock", async (req, res) => {
  try {
    const items = await Item.find({ storeId: req.storeId }).lean();
    const lowest = items.reduce((min, cur) =>
      (cur.rackStock ?? 0) < (min?.rackStock ?? Infinity) ? cur : min,
      null
    );
    res.json(lowest || {});
  } catch (err) {
    console.error("GET /analytics/lowest-stock error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
