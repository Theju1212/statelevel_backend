// server/src/routes/autoRefill.js
import express from "express";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { runAutoRefill } from "../services/autoRefill.js";

const router = express.Router();
router.use(authMiddleware);

// POST /api/auto-refill/trigger
router.post("/trigger", requireRole("owner"), async (req, res) => {
  try {
    const storeId = req.storeId;
    const result = await runAutoRefill(storeId, { dryRun: !!req.query.dry });
    res.json(result);
  } catch (err) {
    console.error("POST /api/auto-refill/trigger error:", err);
    res.status(500).json({ error: err.message || "Auto-refill failed" });
  }
});

export default router;
