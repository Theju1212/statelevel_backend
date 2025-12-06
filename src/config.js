import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Old OpenRouter key
  aiKey: process.env.AI_KEY,

  // ⭐ NEW NAME FOR GEMINI KEY
  geminiKey: process.env.GEMINI_API_KEY_ALERTS,

  // Calendar Alerts Key
  calendarAlertsKey: process.env.CALENDAR_ALERTS_API_KEY,

  // Calendarific Key
  calendarificKey: process.env.CALENDARIFIC_API_KEY,
};

// Validate required env
if (!config.mongoUri) throw new Error('Missing MONGO_URI');

// Gemini key optional warning
if (!config.geminiKey) {
  console.warn("⚠️ Missing GEMINI_API_KEY_ALERTS (needed for Gemini suggestions)");
}

export const AI_KEY = config.aiKey;            // Existing AI key (OpenRouter)
export const GEMINI_KEY = config.geminiKey;    // New Gemini key
export const CALENDARIFIC_API_KEY = config.calendarificKey;

console.log('Config loaded successfully');
