// src/routes/orders.js
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import Order from '../models/Order.js';

const router = express.Router();
router.use(authMiddleware);

// GET /api/orders
router.get('/', async (req, res) => {
  const orders = await Order.find({ storeId: req.storeId }).populate('itemId').sort({ createdAt: -1 });
  res.json(orders);
});

export default router;
