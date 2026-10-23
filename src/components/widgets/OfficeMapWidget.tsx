'use client';
import { useTranslations, useLocale } from 'next-intl';
import { MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { usePresence } from '@/components/presence/PresenceContext';
import { formatNumber } from '@/lib/format';

// Small isometric sketch of the plus-shaped floor plan with per-status counts.
export function OfficeMapWidget() {
  const t = useTranslations();
  const locale = useLocale();
  const { profiles, offices } = useShell();
  const { statusOf } = usePresence();
  const count = (s: string) => profiles.filter((p) => statusOf(p) === s).length;
  const wall = (slot: number) => (offices.find((o) => o.slot === slot)?.wallColor === 'teal' ? 'var(--teal)' : 'var(--accent)');
  return (
    <Link href="/office" className="card group flex flex-col p-4 transition-shadow hover:shadow-md">
      <h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-5" />{t('widgets.officeMap')}</h2>
      <div className="mt-2 flex flex-1 items-center gap-3">
        <svg viewBox="0 0 200 140" className="w-2/3 max-w-56 drop-shadow-sm transition-transform group-hover:scale-[1.03]" aria-hidden>
          <g transform="translate(100 70) scale(1 0.58) rotate(45)">
            <path d="M-30 -80h60v50h50v60h-50v50h-60v-50h-50v-60h50z" fill="#e9dfcf" stroke="#b9a991" strokeWidth="3" />
            <rect x="-78" y="-78" width="46" height="46" fill={wall(1)} opacity=".85" />
            <rect x="32" y="-78" width="46" height="46" fill={wall(2)} opacity=".85" />
            <rect x="-78" y="32" width="46" height="46" fill={wall(3)} opacity=".85" />
            <rect x="32" y="32" width="46" height="46" fill={wall(4)} opacity=".85" />
            <circle r="24" fill="#cfe7e4" stroke="#7fb9b3" strokeWidth="3" />
            <circle r="9" fill="#c9a27a" />
            <path d="M0 24V78M0 -24V-78M24 0H78M-24 0H-78" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" />
          </g>
        </svg>
        <ul className="space-y-1.5 text-xs">
          {(['online', 'busy', 'focus'] as const).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${{ online: 'bg-online', busy: 'bg-busy', focus: 'bg-focus' }[s]}`} />
              {t(`status.${s}`)}<span className="text-muted">{formatNumber(locale, count(s))}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 text-end text-xs text-muted">{t('widgets.floor')}</div>
    </Link>
  );
}
