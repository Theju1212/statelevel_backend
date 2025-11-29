// src/utils/alertService.js
import Store from "../models/Store.js";
import Item from "../models/Item.js";
import { sendEmail } from "../utils/sendEmail.js";

export async function generateAndSendAlerts() {
  try {
    // ⭐ Always use your real storeId
    const storeId = "692a8bf64bbfacf239449732";

    // Fetch store
    const store = await Store.findById(storeId);

    if (!store) {
      console.log("❌ Store not found");
      return;
    }

    // Get email settings
    const settings = store.settings || {};
    const email = settings.notificationEmail;

    // No email = cannot send alert
    if (!email || email.trim() === "") {
      console.log("⚠️ No notification email set, skipping alert");
      return;
    }

    // Fetch low-stock items
    const lowStockItems = await Item.find({
      store: storeId,
      rackStock: { $lt: 5 }
    });

    if (!lowStockItems.length) {
      console.log("✅ No low stock items, skipping alert");
      return;
    }

    // Build the email HTML
    const alertHtml = `
      <h2>🧠 AI Mart – Daily Inventory Alerts</h2>
      <p>${new Date().toLocaleString()}</p>
      <h3>🔴 Low Stock Items</h3>
      <ul>
        ${lowStockItems
          .map(i => `<li>${i.name} – Stock: ${i.rackStock}</li>`)
          .join("")}
      </ul>
    `;

    // Send email using Resend
    await sendEmail(email, "🛒 AI Mart – Inventory Alerts", alertHtml);

    // Save alert copy + date in DB
    store.settings.lastAlertCopy = alertHtml;
    store.settings.lastAlertDate = new Date();
    await store.save();

    console.log("✅ Resend email sent successfully!");
  } catch (err) {
    console.error("❌ Error sending alert:", err);
  }
}
