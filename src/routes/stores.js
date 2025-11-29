// routes/stores.js
import express from "express";
import Store from "../models/Store.js";
import { generateAndSendAlerts } from "../utils/alertService.js";

const router = express.Router();

// ⭐ Use your REAL store ID (hardcoded)
const storeId = "692a8bf64bbfacf239449732";

/* =========================================================
   🧠 GET STORE SETTINGS
   ========================================================= */
router.get("/settings", async (req, res) => {
  try {
    const store = await Store.findById(storeId);
    res.json({ settings: store?.settings || {} });
  } catch (err) {
    console.error("❌ Error loading settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

/* =========================================================
   🧠 UPDATE STORE SETTINGS (EMAIL SAVES HERE)
   ========================================================= */
router.put("/settings", async (req, res) => {
  try {
    const { autoRefill, notificationEmail, notificationPhone } = req.body;

    const update = {
      "settings.autoRefill": autoRefill,
      "settings.notificationEmail": notificationEmail,
      "settings.notificationPhone": notificationPhone,
    };

    // ⭐ FIX: Always update the REAL store
    const store = await Store.findByIdAndUpdate(
      storeId,
      { $set: update },
      { new: true }
    );

    res.json({ success: true, settings: store.settings });
  } catch (err) {
    console.error("❌ Failed to update settings:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/* =========================================================
   🧠 GET LAST EMAIL ALERT COPY (Preview)
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
   🧪 MANUAL ALERT TRIGGER
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
