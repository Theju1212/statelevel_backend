// src/routes/aiRoutes.js
import express from 'express';
import axios from 'axios';
import Item from '../models/Item.js';
import Sale from '../models/Sale.js';
import mongoose from 'mongoose';
import { AI_KEY } from '../config.js';

const router = express.Router();
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// small helper for exponential backoff sleeps
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// normalize item name for matching
const normalize = (s = '') => String(s).trim().toLowerCase();

// === Helper: call OpenRouter with retries ===
async function callOpenRouter(payload, maxRetries = 2, initialDelay = 800) {
  let attempt = 0;
  let delay = initialDelay;
  while (attempt <= maxRetries) {
    try {
      const resp = await axios.post(OPENROUTER_API_URL, payload, {
        headers: {
          Authorization: `Bearer ${AI_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "AI Mart Inventory"
        },
        timeout: 60000
      });
      return resp.data;
    } catch (err) {
      attempt++;
      const status = err.response?.status;
      console.warn(`OpenRouter attempt ${attempt} failed:`, status || err.message);
      // retry on 429 or 5xx or network errors
      if (attempt > maxRetries || (status && status < 500 && status !== 429)) {
        throw err;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error('OpenRouter retries exhausted');
}

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

    // 4. Prepare AI prompt (compact, clear)
    const itemList = alertsData.map(d => {
      return `Item: ${d.item.name} | Stock: ${d.item.rackStock}/${d.item.threshold} | Alerts: ${d.alerts.join(', ')} | SalesPerDay: ${d.salesVelocity} | SoldTotal: ${d.totalSales}`;
    }).join('\n');

    const prompt = `
You are a retail-inventory AI. Return ONLY valid JSON, no markdown or extra text.

{
  "discountSuggestions": [
    {"itemName":"Aata","suggestedPercent":15,"applyQty":5,"reason":"Low stock"}
  ],
  "insights":"2-sentence analysis"
}

Data:
${itemList}

Max discount: ${userDiscountConfig?.maxDiscount || 50}%
`.trim();

    if (!AI_KEY) return res.status(500).json({ error: "AI key missing" });

    // === Better model: Gemini Flash FREE (stable JSON) ===
    const payload = {
      model: "google/gemini-flash-1.5-exp:free",
      messages: [
        { role: "system", content: "You are a JSON API. Return ONLY valid JSON. Respond with well-formed JSON object." },
        { role: "user", content: prompt }
      ],
      temperature: 0.05,
      max_tokens: 700,
      // openrouter supports "response_format", keep it when available to enforce JSON
      response_format: { type: "json_object" }
    };

    // Call OpenRouter with retries
    let responseData;
    try {
      responseData = await callOpenRouter(payload, 2, 800);
    } catch (err) {
      console.error("OpenRouter primary call failed:", err.response?.data || err.message);
      // fallback: try the same payload without response_format (some providers ignore)
      try {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.response_format;
        responseData = await callOpenRouter(fallbackPayload, 1, 1000);
      } catch (err2) {
        console.error("OpenRouter fallback failed:", err2.response?.data || err2.message);
        // graceful fallback: send computed alerts only (no AI)
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

        return res.status(502).json({
          error: "AI provider failed. Returning computed alerts without AI suggestions.",
          alerts,
          discountSuggestions: [],
          insights: "AI unavailable — using local heuristics."
        });
      }
    }

    // Extract raw content
    const raw = responseData?.choices?.[0]?.message?.content?.trim?.() ?? "";
    console.log("AI raw:", raw && raw.length > 200 ? `${raw.slice(0,200)}...` : raw);

    // parse JSON safely
    let aiJson;
    try {
      // If response_format worked OpenRouter returns object already
      if (responseData?.choices?.[0]?.message?.content_object) {
        aiJson = responseData.choices[0].message.content_object;
      } else {
        aiJson = JSON.parse(raw);
      }
      if (!Array.isArray(aiJson.discountSuggestions) || typeof aiJson.insights !== "string") {
        throw new Error("Missing fields in AI response");
      }
    } catch (e) {
      console.warn("AI non-JSON – using fallback parser (best-effort):", e.message);
      const fallback = { discountSuggestions: [], insights: "AI response not JSON — fallback insights." };
      // naive attempt to extract item names
      raw.split('\n').forEach(line => {
        const m = line.match(/Item[:\s]*([^\|]+)/i);
        if (m) {
          fallback.discountSuggestions.push({
            itemName: m[1].trim(),
            suggestedPercent: userDiscountConfig?.defaultDiscount ?? 10,
            applyQty: 1,
            reason: "AI parsing fallback"
          });
        }
      });
      aiJson = fallback;
    }

    // 5. Map AI suggestions to real items
    const discountSuggestions = (aiJson.discountSuggestions || []).map(d => {
      const match = alertsData.find(data =>
        normalize(data.item.name) === normalize(d.itemName)
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
// 2. FESTIVAL GROCERY SUGGESTIONS – try best FREE models
// ========================================
router.post('/festival-suggestions', async (req, res) => {
  try {
    const { festivalName, daysUntil = 0 } = req.body;
    if (!festivalName) return res.status(400).json({ error: 'Festival name required' });

    console.log("AI /festival-suggestions called:", { festivalName, daysUntil });

    const prompt = `
You are a grocery AI. Return ONLY this JSON object (no extra text):

{
  "suggestions": ["Rice 5 kg", "Jaggery 2 kg", "Ghee 1 L"]
}

Festival: "${festivalName}" in ${daysUntil} days.
Give 8–12 items with quantities.
`.trim();

    // prefer Gemini Flash free, fallback to other free models
    const models = [
      "google/gemini-flash-1.5-exp:free",
      "meta-llama/llama-3.2-1b-instruct:free",
      "mistralai/mistral-7b-instruct:free",
      "openchat/openchat-3.5:free"
    ];

    for (const model of models) {
      try {
        const payload = {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 400
        };

        const data = await callOpenRouter(payload, 1, 700);
        const raw = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
        console.log(`Raw from ${model}:`, raw && raw.length > 200 ? `${raw.slice(0,200)}...` : raw);

        // Extract JSON object text and parse
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in model output");
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          return res.json({ suggestions: parsed.suggestions });
        }
      } catch (err) {
        console.warn(`Model ${model} failed:`, err.response?.data || err.message);
        // continue to next model
      }
    }

    // MOCK FALLBACK (deterministic)
    const mock = {
      "Pongal": ["Rice 5 kg", "Jaggery 2 kg", "Ghee 1 L", "Milk 2 L", "Coconut 2 pcs", "Sugarcane 2 sticks", "Turmeric 250 g", "Salt 1 kg"],
      "Lohri": ["Peanuts 1 kg", "Sesame 500 g", "Jaggery 1 kg", "Rewri 500 g", "Popcorn 500 g", "Ghee 500 g", "Sattu 500 g", "Sugar 500 g"],
      "Diwali": ["Oil 5 L", "Diyas 100 pcs", "Sweets 2 kg", "Rangoli 500 g", "Crackers 1 box", "Sugar 1 kg", "Flour 5 kg", "Ghee 1 L"]
    };
    const suggestions = mock[festivalName] || ["Rice 5 kg", "Oil 2 L", "Sugar 1 kg", "Tea 250 g", "Biscuits 500 g", "Salt 1 kg"];
    console.log("Using mock fallback for festival-suggestions");
    return res.json({ suggestions });
  } catch (err) {
    console.error("festival-suggestions error:", err.message);
    res.status(500).json({ error: "Festival suggestions failed" });
  }
});

// ========================================
// 3. APPLY DISCOUNT (unchanged behaviour but safe)
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
    const yourModel = response.data.data.find(m => m.id === "google/gemini-flash-1.5-exp:free" || m.id === "deepseek/deepseek-r1-0528-qwen3-8b");
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
