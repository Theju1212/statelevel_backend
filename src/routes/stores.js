// routes/stores.js
import express from "express";
import Store from "../models/Store.js";
import { generateAndSendAlerts } from "../utils/alertService.js";

const router = express.Router();

// STATIC STORE ID (because you have only one store)
const storeId = "692a8bf64bbfacf239449732";

/* =========================================================
   🧩 GET STORE SETTINGS
   ========================================================= */
router.get("/settings", async (req, res) => {
  try {
    let store = await Store.findById(storeId);

    // If store or settings missing, create defaults
    if (!store) {
      store = await Store.findByIdAndUpdate(
        storeId,
        { $set: { 
            "settings.autoRefill": false,
            "settings.notificationEmail": "",
            "settings.notificationPhone": "",
            "settings.lastAlertCopy": "",
            "settings.lastAlertDate": null
        }},
        { new: true, upsert: true }
      );
    }

    // Ensure missing fields are auto-created
    const defaults = {
      autoRefill: false,
      notificationEmail: "",
      notificationPhone: "",
      lastAlertCopy: "",
      lastAlertDate: null,
    };

    store.settings = { ...defaults, ...store.settings };

    await store.save();

    res.json({ settings: store.settings });
  } catch (err) {
    console.error("❌ Error loading settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

/* =========================================================
   🧩 UPDATE STORE SETTINGS
   ========================================================= */
router.put("/settings", async (req, res) => {
  try {
    const { autoRefill, notificationEmail, notificationPhone } = req.body;

    const update = {
      "settings.autoRefill": autoRefill ?? false,
      "settings.notificationEmail": notificationEmail ?? "",
      "settings.notificationPhone": notificationPhone ?? "",
    };

    const store = await Store.findByIdAndUpdate(
      storeId,
      { $set: update },
      { new: true, upsert: true }
    );

    res.json({ success: true, settings: store.settings });
  } catch (err) {
    console.error("❌ Failed to update settings:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/* =========================================================
   🧩 GET LATEST ALERT
   ========================================================= */
router.get("/alerts", async (req, res) => {
  try {
    const store = await Store.findById(storeId);

    const settings = store?.settings || {};

    res.json({
      lastAlertCopy: settings.lastAlertCopy || "",
      lastAlertDate: settings.lastAlertDate || null,
    });
  } catch (err) {
    console.error("❌ Failed to load alerts:", err);
    res.status(500).json({ error: "Failed to load alerts" });
  }
});

/* =========================================================
   🧪 MANUAL TEST ALERT (SEND EMAIL NOW)
   ========================================================= */
router.get("/test-alerts", async (req, res) => {
  try {
    await generateAndSendAlerts();
    res.json({ success: true, message: "Manual alert email triggered ✅" });
  } catch (err) {
    console.error("❌ Error triggering test alert:", err);
    res.status(500).json({ error: "Failed to send test alert" });
  }
});

export default router;
