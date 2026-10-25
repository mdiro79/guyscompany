'use client';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, EyeOff, ChevronDown } from 'lucide-react';
import { voteAction } from '@/app/actions/polls';
import { formatNumber } from '@/lib/format';
import type { Poll } from '@/lib/data/types';
import type { PollSummary } from '@/lib/polls';

export function TeamVote({ poll, summary }: { poll: Poll | null; summary: PollSummary | null }) {
  const t = useTranslations('widgets');
  const locale = useLocale();
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<number | null>(null);
  const score = local ?? summary?.myScore ?? null;
  return (
    <section className="card p-4">
      <button type="button" className="flex w-full items-center gap-2" onClick={() => setOpen((x) => !x)}>
        <BarChart3 className="size-5" /><h2 className="font-semibold">{t('teamVote')}</h2>
        <ChevronDown className={clsx('ms-auto size-4 transition-transform sm:hidden', open && 'rotate-180')} />
      </button>
      <div className={clsx(!open && 'hidden sm:block')}>
        {!poll || !summary ? <p className="mt-4 text-sm text-muted">{t('noPoll')}</p> : (
          <>
            <p className="mt-3 text-sm font-medium" dir="auto">{poll.question}</p>
            <div className="mt-4 flex items-center justify-between gap-1" dir="ltr">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" disabled={pending || summary.isClosed} aria-pressed={score === n}
                  onClick={() => { setLocal(n); start(async () => { await voteAction(poll.id, n); }); }}
                  className="group flex flex-1 flex-col items-center gap-1">
                  <span className={clsx('size-3.5 rounded-full border-2 transition-all',
                    score === n ? 'scale-125 border-brand bg-brand' : score && n < score ? 'border-brand bg-brand/60' : 'border-line bg-surface group-hover:border-brand')} />
                  <span className="text-[11px] text-muted">{formatNumber(locale, n)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{score ? t('yourVote', { score: formatNumber(locale, score) }) : t('votes', { n: formatNumber(locale, summary.voteCount) })}</span>
              {summary.isClosed && summary.average !== null
                ? <span className="font-semibold text-brand">{formatNumber(locale, summary.average, 1)} / {formatNumber(locale, 10)}</span>
                : <span className="flex items-center gap-1"><EyeOff className="size-3.5" />{t('hiddenScore')}</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
