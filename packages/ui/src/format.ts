/**
 * Indian formats, IST timezone. Implemented without Intl so web (V8) and
 * mobile (Hermes) render identically. IST has no DST: UTC+05:30 always.
 */
export const IST_OFFSET_MINUTES = 330;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** Wall-clock parts in IST. */
export function istParts(input: DateInput) {
  const d = new Date(toDate(input).getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-based
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0 = Sunday
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "06 Oct 2026" */
export function formatDate(input: DateInput): string {
  const p = istParts(input);
  return `${pad2(p.day)} ${MONTHS[p.month]} ${p.year}`;
}

/** "2:05 PM" */
export function formatTime(input: DateInput): string {
  const p = istParts(input);
  const h = p.hour % 12 || 12;
  return `${h}:${pad2(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** "06 Oct 2026, 2:05 PM" */
export function formatDateTime(input: DateInput): string {
  return `${formatDate(input)}, ${formatTime(input)}`;
}

/** "Oct 2026" */
export function formatMonth(input: DateInput): string {
  const p = istParts(input);
  return `${MONTHS[p.month]} ${p.year}`;
}

/** "2026-10-06" — the IST calendar day, for date-typed columns. */
export function toIstDateString(input: DateInput = new Date()): string {
  const p = istParts(input);
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}`;
}

/** First day of the IST month as "YYYY-MM-01". */
export function istMonthStart(input: DateInput = new Date()): string {
  const p = istParts(input);
  return `${p.year}-${pad2(p.month + 1)}-01`;
}

export function isSameIstDay(a: DateInput, b: DateInput): boolean {
  return toIstDateString(a) === toIstDateString(b);
}

/** "just now", "5 min ago", "in 2 h", "3 days ago", then falls back to the date. */
export function formatRelative(input: DateInput, now: DateInput = new Date()): string {
  const diffSec = Math.round((toDate(input).getTime() - toDate(now).getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const fmt = (n: number, unit: string) => (diffSec < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`);
  if (abs < 45) return 'just now';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'min');
  if (abs < 86_400) return fmt(Math.round(abs / 3600), 'h');
  if (abs < 7 * 86_400) {
    const days = Math.round(abs / 86_400);
    return fmt(days, days === 1 ? 'day' : 'days');
  }
  return formatDate(input);
}

/** Time-of-day greeting key in IST. */
export function greetingKey(input: DateInput = new Date()): 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
  const h = istParts(input).hour;
  if (h < 12) return 'greeting.morning';
  if (h < 17) return 'greeting.afternoon';
  return 'greeting.evening';
}

// ---------------------------------------------------------------------------
// Numbers & money
// ---------------------------------------------------------------------------

/** Indian digit grouping: 12345678 → "1,23,45,678". */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  const neg = value < 0;
  const [int, frac] = Math.abs(value).toFixed(decimals).split('.');
  return `${neg ? '-' : ''}${groupIndian(int!)}${frac ? `.${frac}` : ''}`;
}

/** "₹1,23,456" (whole rupees by default). */
export function formatINR(value: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const s = formatNumber(Math.abs(value), opts.decimals ?? 0);
  return `${value < 0 ? '-' : ''}₹${s}`;
}

/** Compact Indian units: ₹950 · ₹85.4K · ₹12.5 L · ₹3.25 Cr */
export function formatINRCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (n: number, d: number) => n.toFixed(d).replace(/\.?0+$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 2)} L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Same units without the rupee symbol (counts, views). */
export function formatCompact(value: number): string {
  return formatINRCompact(value).replace('₹', '');
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals).replace(/\.0+$/, '')}%`;
}

/** Percentage change, e.g. pctChange(120, 100) → 20. Null when there is no base. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** 3725 s → "1h 02m"; 252 s → "4m 12s"; 0 → "0s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${pad2(m)}m`;
  if (m) return `${m}m ${pad2(sec)}s`;
  return `${sec}s`;
}

/** 850 → "850 m"; 2380 → "2.4 km" */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** "+919800000001" / "09800000001" → "+91 98000 00001" */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const ten = digits.slice(-10);
  if (ten.length !== 10) return raw;
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/** Digits-only E.164 for tel: / wa.me links: "919800000001". */
export function phoneForLinks(raw: string): string {
  const ten = raw.replace(/\D/g, '').slice(-10);
  return `91${ten}`;
}

/** "•••• 4821" */
export function maskTail(value: string | null | undefined, keep = 4): string {
  if (!value) return '';
  return `•••• ${value.slice(-keep)}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}
