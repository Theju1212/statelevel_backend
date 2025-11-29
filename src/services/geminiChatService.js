// src/services/geminiChatService.js
import { AI_KEY } from '../config.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// If inventoryData could be large, we stringify safely and truncate if needed
function safeStringifyInventory(inv) {
  try {
    const json = JSON.stringify(inv);
    // don't send absurdly long payloads — trim if > 160k chars
    const limit = 160000;
    if (json.length > limit) {
      console.warn('Inventory trimmed for prompt (too big)');
      return json.slice(0, limit) + '...';
    }
    return json;
  } catch (e) {
    return '{}';
  }
}

async function fetchWithRetries(payload, maxRetries = 3, initialDelay = 800) {
  let attempt = 0;
  let delay = initialDelay;
  while (attempt <= maxRetries) {
    try {
      const resp = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_KEY}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AI Mart Chatbot'
        },
        body: JSON.stringify(payload),
        // fetch in Node 18+ respects global timeout only via AbortController; we rely on server side timeout
      });

      if (!resp.ok) {
        // read body for error details
        const text = await resp.text().catch(() => '');
        const msg = `API Error: ${resp.status} ${resp.statusText} ${text}`;
        // If 429 or 5xx, retry; otherwise throw
        if (resp.status === 429 || resp.status >= 500) {
          throw new Error(msg);
        } else {
          throw new Error(msg);
        }
      }
      const data = await resp.json();
      return data;
    } catch (err) {
      attempt++;
      console.warn(`OpenRouter attempt ${attempt} failed:`, err.message);
      if (attempt > maxRetries) {
        throw err;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error('Retries exhausted');
}

export async function callGeminiAPI(userQuery, inventoryData) {
  // Check key
  if (!AI_KEY) {
    console.error("AI_KEY is not set.");
    return "I'm sorry — AI key is not configured. Contact the administrator.";
  }

  // Use Gemini Flash free - stable, free
  const model = 'google/gemini-flash-1.5-exp:free';

  // Build compact system prompt
  const systemPrompt = `
You are "AI Mart Assistant", a helpful assistant for a small grocery shop owner (Kirana).
Answer using only the JSON or facts present in the provided inventory & sales JSON below.
If the user asks outside the data, say you don't have that data.
Reply in the same language as the user.
Today's date: ${new Date().toLocaleDateString('en-IN')}.
`;

  // inventory safe stringify
  const inventoryString = safeStringifyInventory(inventoryData);

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userQuery}\n\nINVENTORY_JSON:\n${inventoryString}` }
    ],
    temperature: 0.05,
    max_tokens: 600
  };

  try {
    const result = await fetchWithRetries(payload, 3, 800);
    // prefer content delta/choices
    const content = result?.choices?.[0]?.message?.content;
    if (content) return content;
    if (result.error) {
      console.error("OpenRouter error:", result.error);
      return `I'm sorry, I encountered an AI error: ${result.error.message || 'unknown'}`;
    }
    console.error("Unexpected API response:", result);
    return "I got an unexpected response from the AI service.";
  } catch (err) {
    console.error("Fetch error:", err.message || err);
    return "I'm sorry — I couldn't reach the AI service right now. Try again later.";
  }
}

export { callGeminiAPI };
