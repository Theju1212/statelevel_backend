import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Keep Old AI_KEY because some files still import it
  aiKey: process.env.AI_KEY || null,

  // Gemini key
  geminiKey: process.env.GEMINI_API_KEY_ALERTS,

  // Calendar keys
  calendarAlertsKey: process.env.CALENDAR_ALERTS_API_KEY,
  calendarificKey: process.env.CALENDARIFIC_API_KEY,
};

// Validations
if (!config.mongoUri) throw new Error('Missing MONGO_URI');

if (!config.geminiKey) {
  console.warn("⚠️ Missing GEMINI_API_KEY_ALERTS (needed for Gemini suggestions)");
}

export const AI_KEY = config.aiKey;          // ← RESTORED
export const GEMINI_KEY = config.geminiKey;
export const CALENDARIFIC_API_KEY = config.calendarificKey;

console.log('Config loaded successfully');
