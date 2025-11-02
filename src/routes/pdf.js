import express from 'express';
import { generateAIPDF } from '../utils/generatePDF.js';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/authMiddleware.js';
import client from '../api/client';

const router = express.Router();
router.use(authMiddleware);

router.get('/generate-pdf', async (req, res) => {
  try {
    // Fetch AI suggestions (you can reuse your /ai/suggestions logic)
    const aiData = await client.post('/ai/suggestions', {
      items: [],
      salesData: [],
      userDiscountConfig: { defaultDiscount: 10, maxDiscount: 50 }
    }).then(r => r.data);

    const filePath = path.join('temp', `AI_Suggestions_${Date.now()}.pdf`);

    // Ensure temp folder exists
    if (!fs.existsSync('temp')) fs.mkdirSync('temp');

    await generateAIPDF(aiData, filePath);

    res.download(filePath, 'AI_Suggestions.pdf', (err) => {
      if (!err) fs.unlinkSync(filePath); // delete temp file after download
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
