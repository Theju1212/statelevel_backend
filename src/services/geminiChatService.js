/*
 * This file contains the logic to call the OpenRouter API.
 * It is still named 'geminiChatService.js' so you don't have to change your imports.
 */

// --- 1. IMPORT YOUR *NEW* AI_KEY ---
import { AI_KEY } from '../config.js';

/**
 * This function is called by your 'chat.js' route.
 */
export async function callGeminiAPI(userQuery, inventoryData) {
    
    // --- 2. USE THE API KEY FROM YOUR CONFIG ---
    const apiKey = AI_KEY;

    // Check if the key is missing
    if (!apiKey) {
        console.error("AI_KEY is not set or loaded from your .env file."); 
        return "I'm sorry, my brain is not configured. Please contact the administrator.";
    }
    
    // ⭐ UPDATED MODEL (DeepSeek → Gemini Flash Free)
    const model = 'nvidia/nemotron-nano-9b-v2:free';


    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

    const systemPrompt = `
        You are "AI Mart Assistant", a helpful chatbot for a Kirana (local grocery) shop owner.
        Your purpose is to answer questions about the shop's inventory and sales based *ONLY* on the JSON data provided below.
        
        RULES:
        1. Reply in the SAME LANGUAGE as the user (English/Hindi/Telugu).
        2. Use ONLY the inventory JSON provided.
        3. Today's Date: ${new Date().toLocaleDateString('en-IN')}.
        4. Low Stock: when totalStock < threshold.
        5. If user asks about unknown item, say you don't have data.
        
        INVENTORY_DATA:
        ${JSON.stringify(inventoryData)}
    `;

    const payload = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
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
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'AI Mart Chatbot'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) break;

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
                throw error;
            }
        }
    }
    
    if (!response || !response.ok) {
        console.error('Failed to get a response from OpenRouter after retries.');
        return "I'm sorry, I'm having trouble connecting to my brain. Please try again.";
    }

    const result = await response.json();

    // --- PARSE THE OPENROUTER RESPONSE ---
    if (result?.choices?.[0]?.message?.content) {
        return result.choices[0].message.content;
    } 
    else if (result.error) {
        console.error("OpenRouter API Error:", result.error.message);
        return `I'm sorry, I encountered an error: ${result.error.message}`;
    } 
    else {
        console.error("Unexpected API response:", result);
        return "I'm sorry, I received an unusual response. Could you try rephrasing?";
    }
}
