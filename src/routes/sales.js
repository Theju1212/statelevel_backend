// server/src/routes/sales.js
import express from 'express';
import Item from '../models/Item.js';
import Sale from '../models/Sale.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);

// GET /api/sales -> list recent sales for current store
router.get('/', async (req, res) => {
  try {
    const sales = await Sale.find({ storeId: req.storeId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('itemId', 'name sku')
      .lean();
    res.json(sales);
  } catch (err) {
    console.error('GET /api/sales error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales -> record a sale and update item stocks
router.post('/', async (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !quantity) return res.status(400).json({ error: 'itemId and quantity required' });

  try {
    const item = await Item.findOne({ _id: itemId, storeId: req.storeId });
    if (!item) return res.status(404).json({ error: 'item not found' });
    if (item.rackStock < quantity) return res.status(400).json({ error: 'not enough rack stock' });

    item.rackStock -= quantity;
    item.totalStock = Math.max(0, (item.totalStock ?? 0) - quantity);
    await item.save();

    const sale = await Sale.create({ storeId: req.storeId, itemId, quantity });
    res.status(201).json(sale);
  } catch (err) {
    console.error('POST /api/sales error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
