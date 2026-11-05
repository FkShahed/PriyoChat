// Bangladesh time (Asia/Dhaka, UTC+6, no daylight saving) for the WHOLE app.
// Every date/time the user sees goes through these helpers, so it never depends on the phone's own timezone.
// Plain arithmetic is used on purpose: it works the same on every device, with no reliance on Intl timezone data.
export const BD_TZ = 'Asia/Dhaka';
const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Wall-clock parts of an instant, as read on a clock in Dhaka. Returns null for an invalid date. */
export function bdParts(input = Date.now()) {
  const t = new Date(input).getTime();
  if (Number.isNaN(t)) return null;
  const d = new Date(t + OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}

const two = (n) => String(n).padStart(2, '0');

/** "02:30 PM" (or "2:30 PM" with { pad: false }) */
export function bdClock(input, { pad = true } = {}) {
  const p = bdParts(input);
  if (!p) return '';
  const h12 = ((p.h + 11) % 12) + 1;
  return `${pad ? two(h12) : h12}:${two(p.mi)} ${p.h >= 12 ? 'PM' : 'AM'}`;
}

/** Minutes since midnight in Dhaka (0-1439) */
export function bdMinutesOfDay(input = Date.now()) {
  const p = bdParts(input);
  return p ? p.h * 60 + p.mi : 0;
}

/** Whole days since 1970 on the Dhaka calendar: subtract two of them to get "days ago" */
export function bdDayNumber(input = Date.now()) {
  const t = new Date(input).getTime();
  return Number.isNaN(t) ? 0 : Math.floor((t + OFFSET_MS) / DAY_MS);
}

/** A key that changes at Dhaka midnight, e.g. "2026-11-4" */
export function bdDayKey(input = Date.now()) {
  const p = bdParts(input);
  return p ? `${p.y}-${p.mo + 1}-${p.day}` : '';
}

export const bdWeekdayShort = (input) => { const p = bdParts(input); return p ? DAYS_SHORT[p.dow] : ''; };
/** "Nov 4" */
export const bdShortDate = (input) => { const p = bdParts(input); return p ? `${MONTHS_SHORT[p.mo]} ${p.day}` : ''; };
/** "4 Nov 2026" */
export const bdMediumDate = (input) => { const p = bdParts(input); return p ? `${p.day} ${MONTHS_SHORT[p.mo]} ${p.y}` : ''; };
/** "4 November 2026" */
export const bdLongDate = (input) => { const p = bdParts(input); return p ? `${p.day} ${MONTHS_LONG[p.mo]} ${p.y}` : ''; };
/** "Wednesday, 4 November" */
export const bdFullDate = (input = Date.now()) => { const p = bdParts(input); return p ? `${DAYS_LONG[p.dow]}, ${p.day} ${MONTHS_LONG[p.mo]}` : ''; };
/** "4 Nov 2026, 02:30 PM" */
export const bdDateTime = (input) => { const d = bdMediumDate(input); return d ? `${d}, ${bdClock(input)}` : ''; };
