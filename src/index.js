import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/authMiddleware.js";

import authRouter from "./routes/auth.js";
import itemsRouter from "./routes/items.js";
import salesRouter from "./routes/sales.js";
import autoRefillRouter from "./routes/autoRefill.js";
import ordersRouter from "./routes/orders.js";
import storesRouter from "./routes/stores.js";
import analyticsRoutes from "./routes/analytics.js";
import aiRoutes from "./routes/aiRoutes.js";
import chatRoutes from "./routes/chat.js";
import calendarRouter from "./routes/calendar.js";

import { sendAlertEmail } from "./alerts/alertScheduler.js"; // ✅ full working alert sender

import { transporter } from "./alerts/alertScheduler.js";


dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS setup
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://vyapar-ai.onrender.com"   // <-- your deployed frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Enable preflight requests
app.options("*", cors());


// ✅ Routes
app.use("/api/auth", authRouter);
app.use("/api/items", authMiddleware, itemsRouter);
app.use("/api/sales", authMiddleware, salesRouter);
app.use("/api/auto-refill", authMiddleware, autoRefillRouter);
app.use("/api/orders", authMiddleware, ordersRouter);
app.use("/api/stores", authMiddleware, storesRouter);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/calendar", authMiddleware, calendarRouter);

// ✅ Manual alert trigger (for testing anytime)
app.get("/api/test-alerts", async (req, res) => {
  try {
    await sendAlertEmail(); // ✅ this sends email + stores copy
    res.json({
      success: true,
      message: "📨 Manual alert email sent and saved ✅",
    });
  } catch (err) {
    console.error("Alert trigger failed:", err);
    res
      .status(500)
      .json({ success: false, message: err.message || "Failed to send alert" });
  }
});

// ✅ Health check
app.get("/", (_, res) =>
  res.json({ status: "ok", service: "ai-mart-inventory" })
);



app.get("/api/test-smtp", async (req, res) => {
  try {
    await transporter.verify();
    res.json({ success: true, message: "✅ SMTP connection successful!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Connect DB + Start server
async function start() {
  try {
    await mongoose.connect(config.mongoUri);
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`✅ Daily alert cron set for 9 PM IST`);
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
}
start();
