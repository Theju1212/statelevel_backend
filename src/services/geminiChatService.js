/*
 * This file contains the logic to call the OpenRouter API (DeepSeek model).
 * It is still named 'geminiChatService.js' so you don't have to change your imports.
 */

// --- 1. IMPORT YOUR *NEW* AI_KEY ---
import { AI_KEY } from '../config.js'; // <-- 1. CHANGED THIS IMPORT

/**
 * This function is called by your 'chat.js' route.
 */
async function callGeminiAPI(userQuery, inventoryData) {
    
    // --- 2. USE THE API KEY FROM YOUR CONFIG ---
    const apiKey = AI_KEY; // <-- 2. CHANGED THIS LINE

    // Check if the key is missing from your config/env
    if (!apiKey) {
        // Updated error message to match your new key
        console.error("AI_KEY (CAlENDAR_ALERTS_API_KEY) is not set or loaded from your .env file."); 
        return "I'm sorry, my brain is not configured. Please contact the administrator.";
    }
    
    // As you requested:
    const model = 'deepseek/deepseek-r1-0528-qwen3-8b:free';
    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    // --- END OF API SWITCH ---

    const systemPrompt = `
        You are "AI Mart Assistant", a helpful chatbot for a Kirana (local grocery) shop owner.
        Your purpose is to answer questions about the shop's inventory and sales based *ONLY* on the JSON data provided below.
        
        RULES:
        1.  **Language:** You MUST reply in the *exact same language* as the user's query (e.g., if the user asks in Hindi, you reply in Hindi). Supported languages are English, Hindi, and Telugu.
        2.  **Data Source:** Base all your answers *strictly* on the provided JSON data. Do not make up information.
        3.  **Today's Date:** Today is ${new Date().toLocaleDateString('en-IN')}. Use this to determine if items are "Expired" or "Expiring Soon".
        4.  **Tone:** Be helpful, concise, and friendly.
        5.  **Low Stock:** An item is "Low Stock" if its 'totalStock' is less than its 'threshold'.
        6.  **Unknown:** If the user asks about an item not in the JSON, say you don't have data for it.
    
        HERE IS THE INVENTORY AND SALES DATA FROM THE DATABASE:
        ${JSON.stringify(inventoryData)}
    `;

    // OpenRouter uses the OpenAI 'messages' format
    const payload = {
        model: model,
        messages: [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": userQuery }
        ]
    };

    let response;
    let retries = 3;
    let delay = 1000;
    
    while (retries > 0) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`, // OpenRouter uses Bearer token
                    'HTTP-Referer': 'http://localhost:3000', // Recommended by OpenRouter
                    'X-Title': 'AI Mart Chatbot' // Recommended by OpenRouter
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) break; // Success

            if (response.status === 429 || response.status >= 500) {
                console.warn(`Retrying OpenRouter... status ${response.status}. Retries left: ${retries - 1}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                retries--;
            } else {
                const errorBody = await response.text();
                console.error(`API Error: ${response.status} ${response.statusText}`, errorBody);
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error("Fetch error:", error);
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                retries--;
            } else {
                throw error; // All retries failed
            }
        }
    }
    
    if (!response || !response.ok) {
        console.error('Failed to get a response from OpenRouter after retries.');
        return "I'm sorry, I'm having trouble connecting to my brain. Please try again.";
    }

    const result = await response.json();

    // --- 3. PARSE THE OPENROUTER RESPONSE ---
    if (result.choices && result.choices[0].message && result.choices[0].message.content) {
        return result.choices[0].message.content;
    } else if (result.error) {
         console.error("OpenRouter API Error:", result.error.message);
         return `I'm sorry, I encountered an error: ${result.error.message}`;
    } else {
         console.error("Unexpected API response structure:", result);
         return "I'm sorry, I received an unusual response. Could you try rephrasing?";
    }
}

// --- This named export is correct ---
export {
    callGeminiAPI,
};