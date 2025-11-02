import express from 'express';
import { getIndianFestivals, getUpcomingFestivals } from '../services/calendarService.js';

const router = express.Router();

router.get('/festivals', async (req, res) => {
  try {
    const festivals = await getIndianFestivals();
    res.json({ count: festivals.length, festivals });
  } catch (err) {
    console.error('Festival fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch festivals' });
  }
});

router.get('/upcoming', async (req, res) => {
  try {
    const festivals = await getUpcomingFestivals(15);
    res.json({ count: festivals.length, festivals });
  } catch (err) {
    console.error('Upcoming fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch upcoming festivals' });
  }
});

export default router;