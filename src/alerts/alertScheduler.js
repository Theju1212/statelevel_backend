// alerts/alertScheduler.js
import cron from "node-cron";
import nodemailer from "nodemailer";
import Item from "../models/Item.js";
import Sale from "../models/Sale.js";
import Store from "../models/Store.js";

const isSecure = Number(process.env.SMTP_PORT) === 465;

// ✅ Dynamic secure mode
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: isSecure, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }, // avoid network TLS drop
  connectionTimeout: 20000, // 20s timeout
});

export async function generateAlerts() {
  const items = await Item.find({});
  const today = new Date();

  const todaySales = await Sale.find({
    createdAt: {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lte: new Date(today.setHours(23, 59, 59, 999)),
    },
  }).populate("itemId");

  const lowStock = [];
  const expiringSoon = [];
  const refillAlerts = [];

  for (const item of items) {
    if ((item.rackStock ?? 0) <= (item.threshold ?? 0)) {
      lowStock.push(`${item.name} (Rack Stock: ${item.rackStock})`);
    }

    if (item.expiryDate) {
      const diffDays = Math.floor(
        (new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays < 0) expiringSoon.push(`${item.name} - Expired`);
      else if (diffDays <= 3)
        expiringSoon.push(`${item.name} - Expiring in ${diffDays} day(s)`);
    }
  }

  for (const sale of todaySales) {
    if (sale.itemId)
      refillAlerts.push(`${sale.itemId.name} sold ${sale.quantity} units today.`);
  }

  const emailHtml = `
    <h2>🧠 AI Mart – Daily Inventory Alerts</h2>
    <p>📅 ${new Date().toLocaleString()}</p>
    <hr/>
    <h3>🔴 Low Stock Alerts</h3>
    <ul>${lowStock.map(i => `<li>${i}</li>`).join("") || "<li>None</li>"}</ul>

    <h3>⚠️ Expiry Alerts</h3>
    <ul>${expiringSoon.map(i => `<li>${i}</li>`).join("") || "<li>None</li>"}</ul>

    <h3>🧃 Refill Alerts (Today’s Sales)</h3>
    <ul>${refillAlerts.map(i => `<li>${i}</li>`).join("") || "<li>No sales today</li>"}</ul>
  `;

  return { emailHtml };
}

export async function sendAlertEmail() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("❌ Missing SMTP credentials in environment variables");
    return;
  }

  const { emailHtml } = await generateAlerts();

  const store = await Store.findOne({});
  const recipient = store?.settings?.notificationEmail || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject: "🛒 AI Mart – Nightly Inventory Alerts",
      html: emailHtml,
    });

    await Store.updateOne(
      {},
      {
        $set: {
          "settings.lastAlertCopy": emailHtml,
          "settings.lastAlertDate": new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`✅ Alert email sent successfully to ${recipient}`);
  } catch (err) {
    console.error("❌ Failed to send alert email:", err.message);
  }
}

// ✅ Automatic 9 PM IST cron
cron.schedule(
  "0 21 * * *",
  async () => {
    console.log("🌙 Running nightly alert job (9 PM IST)...");
    try {
      await sendAlertEmail();
    } catch (err) {
      console.error("❌ Nightly alert failed:", err.message);
    }
  },
  { timezone: "Asia/Kolkata" }
);

export default { generateAlerts, sendAlertEmail };
