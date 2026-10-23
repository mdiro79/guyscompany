'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';

// Loading bar with a percentage (null = still waiting to start). Fills from the reading start (right in Persian).
export function ProgressBar({ percent, label, dark = false }: { percent: number | null; label: string; dark?: boolean }) {
  const locale = useLocale();
  const value = percent === null ? null : Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} className="w-full space-y-1.5">
      <div className={clsx('flex items-center justify-between gap-3 text-xs', dark ? 'text-white/80' : 'text-muted')}>
        <span className="truncate">{label}</span>
        {value !== null && <span className={clsx('shrink-0 font-semibold tabular-nums', dark ? 'text-white' : 'text-ink')}>{formatNumber(locale, value)}{locale === 'fa' ? '٪' : '%'}</span>}
      </div>
      <div className={clsx('h-2 overflow-hidden rounded-full', dark ? 'bg-white/15' : 'bg-surface-2')}>
        <div className={clsx('h-full rounded-full bg-[#f07a2a] transition-[width] duration-300 ease-out', value === null && 'w-1/4 animate-pulse')}
          style={value === null ? undefined : { width: `${value}%` }} />
      </div>
    </div>
  );
}

// Progress for work whose real progress is unknown (a server round trip): climbs quickly at first,
// then slows down and never reaches 100% on its own.
export function useEasedProgress(active: boolean, halfLifeMs = 1000) {
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    if (!active) { setPercent(0); return; }
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      setPercent(Math.min(97, 100 * (1 - Math.pow(0.5, t / halfLifeMs))));
    }, 80);
    return () => clearInterval(id);
  }, [active, halfLifeMs]);
  return percent;
}
