import express from "express";
import Store from "../models/Store.js";
import { generateAndSendAlerts } from "../utils/alertService.js";

const router = express.Router();

/* GET STORE SETTINGS */
router.get("/settings", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const store = await Store.findById(storeId);
    res.json({ settings: store?.settings || {} });
  } catch (err) {
    console.error("❌ Error loading settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

/* UPDATE STORE SETTINGS */
router.put("/settings", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const { autoRefill, notificationEmail, notificationPhone } = req.body;

    const update = {
      "settings.autoRefill": autoRefill,
      "settings.notificationEmail": notificationEmail,
      "settings.notificationPhone": notificationPhone,
    };

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

/* GET LATEST ALERT COPY */
router.get("/alerts", async (req, res) => {
  try {
    const storeId = req.user.storeId;
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

/* MANUAL TEST ALERT */
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
