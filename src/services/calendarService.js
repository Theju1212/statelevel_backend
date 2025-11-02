/********************************************************************
 *  CALENDAR SERVICE – NATIONAL INDIA ONLY + FALLBACK
 *  - Uses Calendarific only for national holidays
 *  - Falls back to hard-coded list if API is down
 *  - No state-wise calls → no more Server Error spam
 ********************************************************************/
import axios from 'axios';
import NodeCache from 'node-cache';
import { CALENDARIFIC_API_KEY } from '../config.js';

const cache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24-hour cache

// ---------------------------------------------------------------------
//  FALLBACK FESTIVALS (used when Calendarific is down)
// ---------------------------------------------------------------------
const FALLBACK_FESTIVALS = [
  // 2025
  { name: 'Republic Day', date: { iso: '2025-01-26T00:00:00', datetime: { year: 2025, month: 1, day: 26 } }, type: ['National holiday'], description: 'India\'s Republic Day' },
  { name: 'Pongal', date: { iso: '2025-01-14T00:00:00', datetime: { year: 2025, month: 1, day: 14 } }, type: ['Local holiday', 'Religious'], description: 'Tamil harvest festival', locations: ['IN-TN'] },
  { name: 'Makar Sankranti', date: { iso: '2025-01-14T00:00:00', datetime: { year: 2025, month: 1, day: 14 } }, type: ['Religious'], description: 'Harvest festival' },
  { name: 'Lohri', date: { iso: '2025-01-13T00:00:00', datetime: { year: 2025, month: 1, day: 13 } }, type: ['Religious'], description: 'Punjab harvest festival' },
  { name: 'Holi', date: { iso: '2025-03-14T00:00:00', datetime: { year: 2025, month: 3, day: 14 } }, type: ['Religious'], description: 'Festival of Colors' },
  { name: 'Ugadi', date: { iso: '2025-03-30T00:00:00', datetime: { year: 2025, month: 3, day: 30 } }, type: ['Local holiday'], description: 'Telugu/Kannada New Year' },
  { name: 'Ram Navami', date: { iso: '2025-04-06T00:00:00', datetime: { year: 2025, month: 4, day: 6 } }, type: ['Religious'], description: 'Birth of Lord Rama' },
  { name: 'Good Friday', date: { iso: '2025-04-18T00:00:00', datetime: { year: 2025, month: 4, day: 18 } }, type: ['Observance'], description: 'Christian observance' },
  { name: 'Baisakhi', date: { iso: '2025-04-14T00:00:00', datetime: { year: 2025, month: 4, day: 14 } }, type: ['Local holiday'], description: 'Sikh New Year' },
  { name: 'Independence Day', date: { iso: '2025-08-15T00:00:00', datetime: { year: 2025, month: 8, day: 15 } }, type: ['National holiday'], description: 'India\'s Independence' },
  { name: 'Onam', date: { iso: '2025-09-05T00:00:00', datetime: { year: 2025, month: 9, day: 5 } }, type: ['Local holiday'], description: 'Kerala harvest festival' },
  { name: 'Ganesh Chaturthi', date: { iso: '2025-09-07T00:00:00', datetime: { year: 2025, month: 9, day: 7 } }, type: ['Religious'], description: 'Birth of Lord Ganesha' },
  { name: 'Dussehra', date: { iso: '2025-10-02T00:00:00', datetime: { year: 2025, month: 10, day: 2 } }, type: ['Religious'], description: 'Victory of good over evil' },
  { name: 'Diwali', date: { iso: '2025-10-20T00:00:00', datetime: { year: 2025, month: 10, day: 20 } }, type: ['Religious'], description: 'Festival of Lights' },
  { name: 'Guru Nanak Jayanti', date: { iso: '2025-11-15T00:00:00', datetime: { year: 2025, month: 11, day: 15 } }, type: ['Religious'], description: 'Birth of Guru Nanak' },
  { name: 'Christmas', date: { iso: '2025-12-25T00:00:00', datetime: { year: 2025, month: 12, day: 25 } }, type: ['Observance'], description: 'Birth of Jesus' },

  // 2026 (repeat pattern)
  { name: 'Republic Day', date: { iso: '2026-01-26T00:00:00', datetime: { year: 2026, month: 1, day: 26 } }, type: ['National holiday'] },
  { name: 'Pongal', date: { iso: '2026-01-14T00:00:00', datetime: { year: 2026, month: 1, day: 14 } }, type: ['Local holiday', 'Religious'] },
  { name: 'Diwali', date: { iso: '2026-11-08T00:00:00', datetime: { year: 2026, month: 11, day: 8 } }, type: ['Religious'] },
  // ... add more if needed
];

// ---------------------------------------------------------------------
//  Fetch only NATIONAL holidays (no state-wise)
// ---------------------------------------------------------------------
async function fetchNationalFestivals(year) {
  const cacheKey = `national_${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_API_KEY}&country=IN&year=${year}&type=national_holiday,religious,observance`;

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const holidays = res.data?.response?.holidays || [];

    const festivals = holidays
      .filter(h => h.type.some(t => ['National holiday', 'Religious', 'Observance'].includes(t)))
      .map(h => ({ ...h, state: null }));

    cache.set(cacheKey, festivals);
    console.log(`Cached ${festivals.length} national festivals for ${year}`);
    return festivals;
  } catch (err) {
    console.error(`Error fetching national ${year}:`, err.response?.data || err.message);
    return []; // API down → fallback later
  }
}

// ---------------------------------------------------------------------
//  MAIN: Get Indian Festivals (National + Fallback)
// ---------------------------------------------------------------------
export async function getIndianFestivals() {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const [natCurrent, natNext] = await Promise.all([
    fetchNationalFestivals(currentYear),
    fetchNationalFestivals(nextYear)
  ]);

  const apiFestivals = [...natCurrent, ...natNext];

  // If API gave us nothing → use fallback
  const all = apiFestivals.length > 0 ? apiFestivals : FALLBACK_FESTIVALS;

  // Dedupe by name + date
  const seen = new Set();
  const unique = all.filter(f => {
    const key = `${f.name}-${f.date.iso}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total unique Indian festivals: ${unique.length}`);
  return unique.sort((a, b) => new Date(a.date.iso) - new Date(b.date.iso));
}

// ---------------------------------------------------------------------
//  UPCOMING FESTIVALS
// ---------------------------------------------------------------------
export async function getUpcomingFestivals(days = 15) {
  const all = await getIndianFestivals();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);

  return all
    .filter(f => {
      const d = new Date(f.date.iso);
      return d >= now && d <= cutoff;
    })
    .map(f => {
      const daysUntil = Math.ceil((new Date(f.date.iso) - now) / (1000 * 60 * 60 * 24));
      return { ...f, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}