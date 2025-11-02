// server/jobs/scheduler.js
import cron from "node-cron";
import Store from "../src/models/Store.js";
import { runAutoRefill } from "../src/services/autoRefill.js";

export function startScheduler() {
  // Run every hour at minute 5
  cron.schedule("5 * * * *", async () => {
    console.log("Scheduler: checking stores for auto-refill");
    try {
      const stores = await Store.find({ "settings.autoRefill": true }).lean();
      for (const s of stores) {
        try {
          console.log("AutoRefill for store", s._id);
          const res = await runAutoRefill(s._id);
          console.log("AutoRefill result for", s._id, res.summary);
        } catch (innerErr) {
          console.error("AutoRefill inner error for store", s._id, innerErr);
        }
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });
}
