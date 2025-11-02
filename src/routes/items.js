import mongoose from "mongoose";
import express from "express";
import Item from "../models/Item.js";
import { authMiddleware } from "../middleware/authMiddleware.js";


const router = express.Router();
router.use(authMiddleware);

// 🔹 Helper: Generate SKU automatically
const generateSKU = (name, typePrefix = "XX") => {
  return `${typePrefix}-${Date.now().toString().slice(-4)}`;
};

// 🔹 Default items for preloading

// 🔹 Default items for preloading
const defaultItems = {
  Kirana: [
    "Rice", "Sugar", "Salt", "Tea", "Oil", "Wheat",
    "Biscuits", "Soap", "Milk", "Chocolates"
  ],
  General: [
    "Blue Pen", "Notebook", "Stapler", "Glue Stick", "Pencil", "Eraser",
    "Marker", "Highlighter", "Scissors", "Tape", "Calculator", "Folders",
    "Paper Clips", "Sharpener", "Ruler", "Desk Organizer", "Sticky Notes",
    "Whiteboard Marker", "Envelope", "Notebook Pack"
  ]
};

// 🔹 Preload items endpoint
router.get("/preload", async (req, res) => {
  try {
    let { storeType } = req.query;

    // 🧩 Normalize storeType (capitalize properly)
    if (!storeType) return res.status(400).json({ error: "storeType is required" });
    storeType = storeType.charAt(0).toUpperCase() + storeType.slice(1).toLowerCase();

    if (!["Kirana", "General"].includes(storeType)) {
      return res.status(400).json({ error: "Invalid storeType" });
    }

    // ✅ Pull storeId from req.user (based on your authMiddleware)
    const storeId = req.user.storeId || req.storeId;
    if (!storeId) return res.status(400).json({ error: "No storeId found in token" });

    // 🧠 Fetch existing items for that store + type
    const existingItems = await Item.find({ storeId, storeType }).lean();
    const existingNames = new Set(existingItems.map(i => i.name.toLowerCase()));

    // 🧩 Find missing defaults to insert
    const itemsToInsert = defaultItems[storeType]
      .filter(name => !existingNames.has(name.toLowerCase()))
      .map(name => ({
        storeId,
        storeType,
        name,
        sku: `${storeType[0]}P-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
        rack: "R1",
        totalStock: 0,
        rackStock: 0,
        threshold: 10,
        userCreated: false,
      }));

    // 🧩 Insert missing defaults safely (ignore duplicates)
    const insertedItems = [];
    for (const itemData of itemsToInsert) {
      try {
        const item = await Item.create(itemData);
        insertedItems.push(item);
      } catch (err) {
        if (!err.message.includes("duplicate key")) console.error(err);
      }
    }

    // ✅ Return all items (existing + newly inserted)
    const allItems = await Item.find({ storeId, storeType });
    res.json({ items: allItems });
  } catch (err) {
    console.error("Preload items error:", err);
    res.status(500).json({ error: err.message });
  }
});


// 🔹 Alerts handler
router.get("/alerts", async (req, res) => {
  try {
    const items = await Item.find({ storeId: req.storeId });
    const lowStockItems = items.filter(item => (item.rackStock ?? 0) <= (item.threshold ?? 0));

    if (lowStockItems.length === 0) return res.json({ alerts: [] });

    const alerts = [];
    for (const item of lowStockItems) {
      try {
        const msg = await nlAlert({
          itemName: item.name,
          rack: item.rack || "Rack",
          rackStock: item.rackStock ?? 0,
          threshold: item.threshold ?? 0,
          suggestionQty: Math.max(1, (item.threshold ?? 0) * 2)
        });
        alerts.push({ itemId: item._id, message: msg });
      } catch (err) {
        console.error("nlAlert error for item:", item._id, err?.message || err);
        alerts.push({
          itemId: item._id,
          message: `⚠️ Could not generate alert for ${item.name}. Please check manually.`
        });
      }
    }

    res.json({ alerts });
  } catch (err) {
    console.error("GET /api/items/alerts error:", err);
    res.status(500).json({ error: err.message || "Failed to generate alerts" });
  }
});

// 🔹 List items with optional storeType and search filter
router.get("/", async (req, res) => {
  try {
    const { storeType, search } = req.query;
    const query = { storeId: req.storeId };

    if (storeType) query.storeType = storeType;
    if (search) query.name = { $regex: search, $options: "i" };

    const items = await Item.find(query).sort({ name: 1 });
    res.json(items);
  } catch (err) {
    console.error("GET /api/items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Create new item
router.post("/", async (req, res) => {
  try {
    const { name, storeType } = req.body;
    const typePrefix = storeType === "Kirana" ? "KP" : storeType === "General" ? "GP" : "XX";
    const sku = generateSKU(name || "NEW", typePrefix);

    const payload = {
      ...req.body,
      storeId: req.storeId,
      sku,
      userCreated: true,
      storeType: storeType || "Kirana"
    };

    const item = await Item.create(payload);
    res.status(201).json(item);
  } catch (err) {
    console.error("POST /api/items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Recommendation endpoint
router.get("/:id/recommendation", async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, storeId: req.storeId }).lean();
    if (!item) return res.status(404).json({ error: "Item not found" });

    const threshold = item.threshold ?? 0;
    const rackStock = item.rackStock ?? 0;
    const displayCap = item.displayCapacity ?? (threshold * 2 || 20);
    const totalStock = item.totalStock ?? 0;

    let suggestedQty = Math.max(
      0,
      Math.min(displayCap - rackStock, Math.max(0, threshold * 2 - rackStock))
    );
    suggestedQty = Math.min(suggestedQty, totalStock);

    let explanation = `Algorithmic suggestion: refill ${suggestedQty} units (rack ${rackStock}/${displayCap}, threshold ${threshold}).`;

    try {
      const prompt = `You are an assistant for a small shop. For item "${item.name}" with rack stock ${rackStock}, total stock ${totalStock}, threshold ${threshold}, and display capacity ${displayCap}, recommend a concise number of units to refill and one short reason.`;
      const aiResp = await askLLM(prompt, { max_tokens: 80 });
      if (aiResp && !aiResp.startsWith("[AI stub]")) explanation = aiResp;
    } catch (aiErr) {
      console.warn("Recommendation AI call failed, using algorithmic suggestion", aiErr?.message || aiErr);
    }

    res.json({ suggestedQty, explanation });
  } catch (err) {
    console.error("GET /api/items/:id/recommendation error:", err);
    res.status(500).json({ error: err.message || "Recommendation failed" });
  }
});

// 🔹 Get single item
// ✅ GET single item safely
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    const item = await Item.findOne({ _id: id, storeId: req.storeId });
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json(item);
  } catch (err) {
    console.error("GET /api/items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Update item
// ✅ UPDATE item safely
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ObjectId before touching DB
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    const allowedFields = [
      "name",
      "sku",
      "rack",
      "totalStock",
      "rackStock",
      "threshold",
      "expiryDate",
      "storeType"
    ];
    const updates = {};
    for (let key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const item = await Item.findOneAndUpdate(
      { _id: id, storeId: req.storeId },
      updates,
      { new: true }
    );

    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    console.error("PUT /api/items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});



// 🔹 Delete item
// ✅ DELETE item safely
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    await Item.deleteOne({ _id: id, storeId: req.storeId });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
