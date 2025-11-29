import Store from "../models/Store.js";
import Item from "../models/Item.js";
import { sendEmail } from "../utils/sendEmail.js";

export async function generateAndSendAlerts() {
  try {
    const store = await Store.findOne({});
    const settings = store?.settings || {};
    const email = settings.notificationEmail;

    if (!email) {
      console.log("⚠️ No notification email set, skipping alert");
      return;
    }

    const lowStockItems = await Item.find({ rackStock: { $lt: 5 } });

    if (!lowStockItems.length) {
      console.log("✅ No low stock items, skipping alert");
      return;
    }

    const alertHtml = `
      <h2>🧠 AI Mart – Daily Inventory Alerts</h2>
      <p>${new Date().toLocaleString()}</p>
      <h3>🔴 Low Stock Alerts</h3>
      <ul>
        ${lowStockItems
          .map(i => `<li>${i.name} – Stock: ${i.rackStock}</li>`)
          .join("")}
      </ul>
    `;

    await sendEmail(email, "🛒 AI Mart – Inventory Alerts", alertHtml);

    store.settings.lastAlertCopy = alertHtml;
    store.settings.lastAlertDate = new Date();
    await store.save();

    console.log("✅ Resend email sent successfully");
  } catch (err) {
    console.error("❌ Error in Resend alert:", err);
  }
}
