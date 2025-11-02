
// utils/alertService.js
import nodemailer from "nodemailer";
import Store from "../models/Store.js";
import Item from "../models/Item.js"; // assuming you have an Item model

// 🧠 Function: Generate low-stock HTML + send alert email
export async function generateAndSendAlerts() {
  try {
    // 1️⃣ Fetch store & items
    const store = await Store.findOne({});
    const settings = store?.settings || {};
    const email = settings.notificationEmail;

    if (!email) {
      console.log("⚠️ No notification email set, skipping alert");
      return;
    }

    const lowStockItems = await Item.find({ rackStock: { $lt: 5 } }); // customize threshold
    if (!lowStockItems.length) {
      console.log("✅ No low stock items, skipping alert");
      return;
    }

    // 2️⃣ Generate HTML content
    const alertHtml = `
      <h2>🧠 AI Mart – Daily Inventory Alerts</h2>
      <p>📅 ${new Date().toLocaleString()}</p>
      <h3>🔴 Low Stock Alerts</h3>
      <ul>
        ${lowStockItems
          .map(
            (i) =>
              `<li>${i.name} (Rack Stock: ${i.rackStock})</li>`
          )
          .join("")}
      </ul>
    `;

    // 3️⃣ Configure transporter (your existing SMTP credentials)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER, // e.g. your Gmail ID
        pass: process.env.SMTP_PASS, // Gmail app password
      },
    });

    // 4️⃣ Send mail
    await transporter.sendMail({
      from: `"AI Mart Alerts" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "🛒 AI Mart – Nightly Inventory Alerts",
      html: alertHtml,
    });

    // 5️⃣ Save copy + date into store settings
    store.settings.lastAlertCopy = alertHtml;
    store.settings.lastAlertDate = new Date();
    await store.save();

    console.log("✅ Alert email sent & stored successfully!");
  } catch (err) {
    console.error("❌ Error in generateAndSendAlerts:", err);
  }
}
