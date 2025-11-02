import express from 'express';
import axios from 'axios';
import Item from '../models/Item.js';
import Sale from '../models/Sale.js';
import mongoose from 'mongoose';
import { AI_KEY } from '../config.js';

const router = express.Router();
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ========================================
// 1. LOW STOCK + EXPIRY + VELOCITY SUGGESTIONS (JSON-FORCED)
// ========================================
router.post('/suggestions', async (req, res) => {
  console.log("REQUEST BODY:", req.body);
  console.log("STORE ID FROM JWT:", req.storeId);
  console.log("AI_KEY LOADED:", !!AI_KEY);

  try {
    const { userDiscountConfig } = req.body;
    const storeId = req.storeId;
    if (!storeId) return res.status(400).json({ error: 'Store ID missing' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Fetch ALL items
    const items = await Item.find({
      storeId: new mongoose.Types.ObjectId(storeId)
    }).lean();

    // 2. Fetch recent sales (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sales = await Sale.find({
      storeId: new mongoose.Types.ObjectId(storeId),
      createdAt: { $gte: thirtyDaysAgo }
    }).populate('itemId', 'name rackStock threshold expiryDate').lean();

    const validSales = sales.filter(s => s.itemId && s.itemId._id);

    // 3. Calculate alerts
    const alertsData = items.map(item => {
      const alerts = [];

      if ((item.rackStock ?? 0) <= (item.threshold ?? 0)) {
        alerts.push('LOW_STOCK');
      }

      if (item.expiryDate) {
        const expiry = new Date(item.expiryDate);
        if (!isNaN(expiry)) {
          const diffDays = Math.floor((expiry - today) / 86400000);
          if (diffDays < 0) alerts.push('EXPIRED');
          else if (diffDays <= 3) alerts.push('EXPIRING_SOON');
        }
      }

      const itemSales = validSales.filter(s => 
        s.itemId._id.toString() === item._id.toString()
      );
      const salesVelocity = itemSales.length / 30;
      const totalSales = itemSales.reduce((sum, s) => sum + s.quantity, 0);

      if (salesVelocity < 0.5 && item.rackStock > 0) {
        alerts.push('LOW_VELOCITY');
      }

      return { item, alerts, salesVelocity: salesVelocity.toFixed(2), totalSales };
    }).filter(d => d.alerts.length > 0);

    if (alertsData.length === 0) {
      return res.json({
        alerts: [],
        discountSuggestions: [],
        insights: "No alerts: All stock levels good, no expiring items, healthy sales."
      });
    }

    // 4. Prepare AI prompt
    const itemList = alertsData.map(d => {
      return `Item: ${d.item.name} | Stock: ${d.item.rackStock}/${d.item.threshold} | Alerts: ${d.alerts.join(', ')} | Sales: ${d.salesVelocity}/day | Sold: ${d.totalSales}`;
    }).join('\n');

    const prompt = `
You are a retail-inventory AI. Return **ONLY** this JSON (no markdown, no extra text):

{
  "discountSuggestions": [
    {"itemName":"Aata","suggestedPercent":15,"applyQty":5,"reason":"Low stock"}
  ],
  "insights":"2-sentence analysis"
}

Data:
${itemList}
Max discount: ${userDiscountConfig?.maxDiscount || 50}%
`;

    if (!AI_KEY) return res.status(500).json({ error: "AI key missing" });

    // === CALL OpenRouter with JSON-FORCED MODEL ===
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: "deepseek/deepseek-r1-0528-qwen3-8b:free",  // JSON-GUARANTEED
        messages: [
          { role: "system", content: "You are a JSON API. Return ONLY valid JSON." },
          { role: "user",   content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          Authorization: `Bearer ${AI_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "AI Mart Inventory"
        },
        timeout: 60000
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("AI raw:", raw);

    let aiJson;
    try {
      aiJson = JSON.parse(raw);
      if (!Array.isArray(aiJson.discountSuggestions) || typeof aiJson.insights !== "string") {
        throw new Error("Missing required fields");
      }
    } catch (e) {
      console.warn("AI non-JSON – using fallback parser:", raw);
      const fallback = {
        discountSuggestions: [],
        insights: "AI response was not JSON – using default values."
      };
      raw.split('\n').forEach(line => {
        const m = line.match(/Item[:\s]*([^\|]+)/i);
        if (m) {
          fallback.discountSuggestions.push({
            itemName: m[1].trim(),
            suggestedPercent: 15,
            applyQty: 5,
            reason: "AI parsing fallback"
          });
        }
      });
      aiJson = fallback;
    }

    // 5. Map AI suggestions to real items
    const discountSuggestions = (aiJson.discountSuggestions || []).map(d => {
      const match = alertsData.find(data => 
        data.item.name.toLowerCase() === d.itemName?.toLowerCase()
      );
      if (!match) return null;

      const item = match.item;
      return {
        itemId: item._id,
        itemName: item.name,
        rackStock: item.rackStock ?? 0,
        threshold: item.threshold ?? 0,
        daysToExpiry: item.expiryDate ? Math.floor((new Date(item.expiryDate) - today) / 86400000) : null,
        salesVelocity: match.salesVelocity,
        totalSales: match.totalSales,
        suggestedPercent: Math.min(
          Math.max(0, d.suggestedPercent ?? userDiscountConfig?.defaultDiscount ?? 10),
          userDiscountConfig?.maxDiscount ?? 50
        ),
        applyQty: Math.max(0, Math.min(d.applyQty ?? 0, item.rackStock ?? 0)),
        reason: d.reason || "AI recommendation"
      };
    }).filter(Boolean);

    // 6. Generate alerts
    const alerts = alertsData.map(d => {
      const item = d.item;
      const messages = [];
      if (d.alerts.includes('LOW_STOCK')) messages.push(`${item.name}: Low stock (${item.rackStock}/${item.threshold})`);
      if (d.alerts.includes('EXPIRED')) messages.push(`${item.name}: EXPIRED!`);
      if (d.alerts.includes('EXPIRING_SOON')) {
        const days = Math.floor((new Date(item.expiryDate) - today) / 86400000);
        messages.push(`${item.name}: Expiring in ${days} days`);
      }
      if (d.alerts.includes('LOW_VELOCITY')) messages.push(`${item.name}: Slow sales (${d.salesVelocity}/day)`);
      return { itemName: item.name, message: messages.join('; '), itemId: item._id };
    });

    res.json({
      alerts,
      discountSuggestions,
      insights: aiJson.insights || "AI analyzing your inventory patterns.",
      summary: {
        totalItems: items.length,
        alertsCount: alertsData.length,
        lowStock: alertsData.filter(d => d.alerts.includes('LOW_STOCK')).length,
        expiring: alertsData.filter(d => d.alerts.includes('EXPIRED') || d.alerts.includes('EXPIRING_SOON')).length
      }
    });

  } catch (err) {
    console.error("AI /suggestions error:", err.response?.data || err.message);
    res.status(500).json({ error: "AI processing failed" });
  }
});

// ========================================
// 2. FESTIVAL GROCERY SUGGESTIONS – MiniMax-M2 only
// ========================================
router.post('/festival-suggestions', async (req, res) => {
  const { festivalName, daysUntil = 0 } = req.body;
  if (!festivalName) return res.status(400).json({ error: 'Festival name required' });

  console.log("AI /festival-suggestions called:", { festivalName, daysUntil });

  const prompt = `
You are a grocery AI. Return **ONLY** this JSON (no extra text, no markdown):

{
  "suggestions": ["Rice 5 kg", "Jaggery 2 kg", "Ghee 1 L", "Milk 2 L"]
}

Festival: "${festivalName}" in ${daysUntil} days.

Rules:
- Pongal: rice, jaggery, ghee, milk, coconut, sugarcane
- Lohri: peanuts, sesame, jaggery, rewri, popcorn
- Diwali: oil, diyas, sweets, rangoli powder, crackers
- Republic Day: tri-color sweets, flags, tea, biscuits
- Holi: colors, gujiya, thandai, sweets
- Default: oil, rice, sugar, tea, biscuits

Give 8–12 items with quantity.
`.trim();

  const models = [
    "google/gemini-flash-1.5-exp:free",
    "mistralai/mistral-7b-instruct:free",
    "meta-llama/llama-3.2-1b-instruct:free",
    "openchat/openchat-3.5:free"
  ];

  let lastError;
  for (const model of models) {
    try {
      const response = await axios.post(
        OPENROUTER_API_URL,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 400
        },
        {
          headers: {
            Authorization: `Bearer ${AI_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "AI Mart"
          },
          timeout: 30000
        }
      );

      const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? "";
      console.log(`Raw from ${model}:`, raw);

      // Extract JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");

      let parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        console.log("Success with model:", model);
        return res.json({ suggestions: parsed.suggestions });
      }

    } catch (err) {
      lastError = err;
      console.error(`Model ${model} failed:`, err.response?.status || err.message);
      if (err.response?.status === 429) await new Promise(r => setTimeout(r, 60000));
    }
  }

  // MOCK FALLBACK
  const mock = {
    "Pongal": ["Rice 5 kg", "Jaggery 2 kg", "Ghee 1 L", "Milk 2 L", "Coconut 2 pcs", "Sugarcane 2 sticks"],
    "Lohri": ["Peanuts 1 kg", "Sesame 500 g", "Jaggery 1 kg", "Rewri 500 g", "Popcorn 500 g"],
    "Diwali": ["Oil 5 L", "Diyas 100 pcs", "Sweets 2 kg", "Rangoli 500 g", "Crackers"],
    "Republic Day": ["Tri-color sweets", "Flags 10 pcs", "Tea 250 g", "Biscuits 1 kg"],
    "Holi": ["Colors 100 g", "Gujiya mix", "Thandai", "Sweets 1 kg"],
    "Ugadi": ["Jaggery 1 kg", "Raw Mango 2 kg", "Tamarind 500 g", "Neem Flowers", "Banana 12 pcs"]
  };
  const suggestions = mock[festivalName] || ["Rice 5 kg", "Oil 2 L", "Sugar 1 kg"];
  console.log("Using mock fallback");
  res.json({ suggestions });
});


// ========================================
// 3. APPLY DISCOUNT
// ========================================
router.post('/apply-discount', async (req, res) => {
  try {
    const { itemId, discountPercent, applyQty } = req.body;
    if (!itemId || discountPercent === undefined || applyQty === undefined) {
      return res.status(400).json({ error: 'itemId, discountPercent, and applyQty required' });
    }

    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.discountPercent = discountPercent;
    item.discountQty = applyQty;
    await item.save();

    res.json({ 
      message: `Discount ${discountPercent}% applied to ${applyQty} units of ${item.name}`,
      item 
    });
  } catch (err) {
    console.error("Apply discount error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// 4. HEALTH CHECK
// ========================================
router.get('/test', async (req, res) => {
  try {
    const response = await axios.get("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${AI_KEY}` }
    });
    const yourModel = response.data.data.find(m => m.id === "qwen/qwen-2.5-7b-instruct:free");
    
    res.json({ 
      status: "OpenRouter ready!", 
      model: yourModel?.id || "Model not found",
      aiKeyLoaded: !!AI_KEY,
      routes: [
        "POST /suggestions → low stock + expiry",
        "POST /festival-suggestions → grocery items",
        "POST /apply-discount → apply discount",
        "GET /test → health check"
      ]
    });
  } catch (err) {
    console.error("Health check failed:", err.message);
    res.status(401).json({ error: "AI key invalid or OpenRouter unreachable" });
  }
});

export default router;