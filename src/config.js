import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // AI Key
  aiKey: process.env.AI_KEY,  // 👈 USE AI_KEY DIRECTLY

  // Calendar Alerts Key (if different)
  calendarAlertsKey: process.env.CALENDAR_ALERTS_API_KEY,

  // Calendarific Key
  calendarificKey: process.env.CALENDARIFIC_API_KEY,
};

// Validate
if (!config.mongoUri) throw new Error('Missing MONGO_URI');
if (!config.aiKey) throw new Error('Missing AI_KEY');
if (!config.calendarificKey) throw new Error('Missing CALENDARIFIC_API_KEY');

export const AI_KEY = config.aiKey;  // <-- The Correct Export
export const CALENDARIFIC_API_KEY = config.calendarificKey;

console.log('Config loaded successfully');
