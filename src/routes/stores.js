// routes/stores.js
import express from "express";
import Store from "../models/Store.js";

const router = express.Router();

/* =========================================================
   🧠 STORE SETTINGS ROUTES
   ========================================================= */

// 🧩 Get Store Settings
router.get("/settings", async (req, res) => {
  try {
    const store = await Store.findOne({});
    res.json({ settings: store?.settings || {} });
  } catch (err) {
    console.error("❌ Error loading settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// 🧩 Update Store Settings
router.put("/settings", async (req, res) => {
  try {
    const { autoRefill, notificationEmail, notificationPhone } = req.body;

    const update = {
      "settings.autoRefill": autoRefill,
      "settings.notificationEmail": notificationEmail,
      "settings.notificationPhone": notificationPhone,
    };

    const store = await Store.findOneAndUpdate({}, { $set: update }, { new: true, upsert: true });
    res.json({ success: true, settings: store.settings });
  } catch (err) {
    console.error("❌ Failed to update settings:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/* =========================================================
   🧠 ALERT COPY ROUTES (for Settings page + cron updates)
   ========================================================= */

// 🧠 Fetch latest email alert copy
router.get("/alerts", async (req, res) => {
  try {
    const store = await Store.findOne({});
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
   🧪 TEST ALERT MANUAL TRIGGER (optional)
   ========================================================= */

// 🧪 Manually trigger daily alert email (for testing)
import { generateAndSendAlerts } from "../utils/alertService.js"; // make sure this function exists

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
