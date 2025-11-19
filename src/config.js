import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // AI Key (DeepSeek via OpenRouter)
  CALENDAR_ALERTS_API_KEY: process.env.CAlENDAR_ALERTS_API_KEY,

  // Calendarific Key (for fetching holidays)
  calendarificKey: process.env.CALENDARIFIC_API_KEY,
};

// Validate
if (!config.mongoUri) throw new Error('Missing MONGO_URI');
if (!config.calendarificKey) throw new Error('Missing CALENDARIFIC_API_KEY');
if (!config.CALENDAR_ALERTS_API_KEY) throw new Error('Missing CALENDAR_ALERTS_API_KEY');

export const CALENDARIFIC_API_KEY = config.calendarificKey;
export const AI_KEY = config.CAlENDAR_ALERTS_API_KEY;  // ← for AI only

console.log('Config loaded successfully');