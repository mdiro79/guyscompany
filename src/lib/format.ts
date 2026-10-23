const intlLocale = (locale: string) => (locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US');

export function formatDate(locale: string, value: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'Asia/Tehran', ...opts }).format(new Date(value));
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

// Whole days between today and a YYYY-MM-DD date (negative = past).
export function daysFromToday(isoDate: string, now = new Date()) {
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

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
