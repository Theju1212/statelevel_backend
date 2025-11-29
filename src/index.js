// server/index.js
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

import { sendAlertEmail, transporter } from "./alerts/alertScheduler.js";

dotenv.config();

const app = express();
app.use(express.json());

/* -------------------------------------------------------
   ✅ CORS (Frontend: Vite localhost + Render deployment)
--------------------------------------------------------- */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://vyapar-ai.onrender.com"
];

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.options("*", cors());

/* -------------------------------------------------------
   🚀 ROUTES
--------------------------------------------------------- */

// Public auth routes
app.use("/api/auth", authRouter);

// Protected routes
app.use("/api/items", authMiddleware, itemsRouter);
app.use("/api/sales", authMiddleware, salesRouter);
app.use("/api/auto-refill", authMiddleware, autoRefillRouter);
app.use("/api/orders", authMiddleware, ordersRouter);
app.use("/api/stores", authMiddleware, storesRouter);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/calendar", authMiddleware, calendarRouter);

/* -------------------------------------------------------
   📩 Manual alert trigger
--------------------------------------------------------- */
app.get("/api/test-alerts", async (req, res) => {
  try {
    await generateAndSendAlerts();
    res.json({ success: true, message: "Resend email sent!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


/* -------------------------------------------------------
   ❤️ Health check
--------------------------------------------------------- */
app.get("/", (_, res) =>
  res.json({ status: "ok", service: "ai-mart-inventory" })
);

/* -------------------------------------------------------
   🔗 CONNECT DB + START SERVER
--------------------------------------------------------- */
async function start() {
  try {
    await mongoose.connect(config.mongoUri);
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running: http://localhost:${PORT}`);
      console.log("⏰ Daily alert cron scheduled at 9 PM IST");
    });

  } catch (err) {
    console.error("❌ Server startup failed:", err);
    process.exit(1);
  }
}

start();
