/* Date helpers. Dates are plain 'YYYY-MM-DD' strings everywhere, never Date objects with a timezone. */

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISO(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(value, days) {
  const d = parseISO(value);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export const addDays = shiftDate;

export function shiftMonth(value, months) {
  const d = parseISO(value);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

export function diffDays(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / 86400000);
}

export function formatShort(value) {
  if (!value) return '';
  return parseISO(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDay(value, withYear = false) {
  if (!value) return '';
  return parseISO(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

export function formatMonth(value) {
  return parseISO(value).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/* A due label and a tone for colouring: overdue, today, soon, later. */
export function dueInfo(dueDate, done, today = toISODate()) {
  if (!dueDate) return null;
  const days = diffDays(dueDate, today);
  if (done) return { text: formatDay(dueDate), tone: 'done', days };
  if (days < 0) return { text: days === -1 ? 'Yesterday' : formatDay(dueDate), tone: 'overdue', days };
  if (days === 0) return { text: 'Today', tone: 'today', days };
  if (days === 1) return { text: 'Tomorrow', tone: 'soon', days };
  if (days < 7) return { text: parseISO(dueDate).toLocaleDateString('en-GB', { weekday: 'short' }), tone: 'soon', days };
  return { text: formatDay(dueDate), tone: 'later', days };
}

/* Six-week grid starting on Monday that contains the month of `anchor`. */
export function monthGrid(anchor) {
  const first = parseISO(anchor);
  first.setDate(1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const month = first.getMonth();
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: toISODate(d), inMonth: d.getMonth() === month, day: d.getDate() });
  }
  return days;
}

export function formatDuration(minutes) {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* Parses '1h 30m', '90m', '2h', '1.5h' or a bare number of minutes. Returns null if blank, NaN-free or throws. */
export function parseDuration(text) {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d+(\.\d+)?h$/.test(t)) return Math.round(parseFloat(t) * 60);
  const m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  throw new Error('Use a format like 1h 30m, 45m or 2h.');
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}
