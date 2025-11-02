/**
 * Chat Route (src/routes/chat.js)
 *
 * This file defines the /api/chat endpoint for the chatbot.
 */
import express from 'express';
import Item from '../models/Item.js';
import Sale from '../models/Sale.js';
// This named import correctly matches the service file
import { callGeminiAPI } from '../services/geminiChatService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect this entire route with your existing auth middleware
router.use(authMiddleware);

/**
 * @route   POST /
 * @desc    Handle chatbot queries
 * @access  Private (uses authMiddleware)
 */
// The path is '/' because we mounted this router at '/api/chat' in your main index.js
router.post('/', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // --- DEBUG LOGGING (Keep this to check storeId) ---
        console.log(`[Chat Route] Received query from user: ${req.user.id}, storeId: ${req.user.storeId}`);
        if (!req.user.storeId) {
             console.error("[Chat Route] CRITICAL: storeId is missing from req.user! Cannot fetch items.");
             // Return an error if storeId is missing, as item fetching will fail.
             return res.status(400).json({ error: 'User store information is missing. Cannot process request.' });
        }
        // --- END DEBUG LOGGING ---


        // 1. RETRIEVAL: Get data from MongoDB
        // Fetch items for the specific store
        const items = await Item.find({ storeId: req.user.storeId }).lean();
        
        console.log(`[Chat Route] Found ${items.length} items for store ${req.user.storeId}`);
        
        // --- FIX: Query Sales using itemId, not sku ---
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); 
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999); 

        // Get the ObjectIds of the items found
        const itemIds = items.map(item => item._id); // <-- Get _id instead of sku

        const recentSales = await Sale.find({ 
            itemId: { $in: itemIds }, // <-- Use itemId (ObjectId) to match Sales
            createdAt: { 
                $gte: todayStart,
                $lte: todayEnd
            } 
        })
            .sort({ createdAt: -1 }) 
            .lean();
        // --- END FIX ---

        console.log(`[Chat Route] Found ${recentSales.length} sales today for these items.`);

        // Prepare data for the AI prompt
        const inventoryData = {
            items: items, // Send all found items
            sales: recentSales, // Send today's sales for those items
        };

        // 2. AUGMENTATION & GENERATION: Send data and query to the AI Service (DeepSeek)
        const botReply = await callGeminiAPI(query, inventoryData);

        // 3. Respond to the frontend
        res.json({ reply: botReply });

    } catch (error) {
        console.error("Error in /api/chat route:", error);
        // Provide a more specific error message if possible
        const errorMessage = error.message.includes('storeId') ? 'Error processing request due to missing store information.' : 'Internal server error processing chat request';
        res.status(500).json({ error: errorMessage });
    }
});

// This default export matches your 'index.js' import statement
export default router;

