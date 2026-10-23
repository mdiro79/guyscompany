const intlLocale = (locale: string) => (locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US');

// The team works on Tehran time; servers run on UTC, so dates are always computed in this zone.
export const APP_TIME_ZONE = 'Asia/Tehran';

export function formatDate(locale: string, value: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: APP_TIME_ZONE, ...opts }).format(new Date(value));
}

export function formatTime(locale: string, value: string | Date) {
  return formatDate(locale, value, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatNumber(locale: string, n: number, digits = 0) {
  return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: digits }).format(n);
}

export function formatBytes(locale: string, bytes: number) {
  if (bytes < 1024) return `${formatNumber(locale, bytes)} B`;
  if (bytes < 1024 ** 2) return `${formatNumber(locale, bytes / 1024, 1)} KB`;
  return `${formatNumber(locale, bytes / 1024 ** 2, 1)} MB`;
}

// YYYY-MM-DD of an instant in the team's time zone.
export function zonedDate(value: string | Date = new Date(), timeZone = APP_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export const todayIso = (now = new Date()) => zonedDate(now);

// Whole days between today and a YYYY-MM-DD date (negative = past).
export function daysFromToday(isoDate: string, now = new Date()) {
  const [ty, tm, td] = todayIso(now).split('-').map(Number);
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wall - (date.getTime() - date.getMilliseconds());
}

// Reads a datetime-local value ("2026-10-23T10:00", no zone) as wall-clock time in the team's time zone.
export function fromZonedLocal(local: string, timeZone = APP_TIME_ZONE): Date {
  const asUtc = new Date(`${local}Z`);
  if (Number.isNaN(asUtc.getTime())) return asUtc;
  return new Date(asUtc.getTime() - zoneOffsetMs(asUtc, timeZone));
}

const TAG_COLORS = [
  'bg-accent-soft text-accent', 'bg-teal-soft text-teal', 'bg-brand-soft text-brand',
  'bg-[#ece6fb] text-[#6d4fc4] dark:bg-[#2b2540] dark:text-[#b9a6f5]',
  'bg-[#fde4e4] text-[#c24141] dark:bg-[#3d2121] dark:text-[#f2a0a0]',
  'bg-[#e2ecfb] text-[#3567c4] dark:bg-[#1d2a40] dark:text-[#9dbdf5]',
];

export function tagColor(tag: string) {
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
