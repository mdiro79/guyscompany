'use client';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Target, Plus, X, ChevronDown } from 'lucide-react';
import { addFocusAction, toggleFocusAction, deleteFocusAction } from '@/app/actions/misc';
import { formatDate, formatNumber } from '@/lib/format';
import type { FocusItem } from '@/lib/data/types';

export function TodaysFocus({ items }: { items: FocusItem[] }) {
  const t = useTranslations('widgets');
  const locale = useLocale();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const done = items.filter((i) => i.done).length;
  return (
    <section className="card relative overflow-hidden p-4">
      <button type="button" className="flex w-full items-center gap-2" onClick={() => setOpen((x) => !x)}>
        <Target className="size-5" /><h2 className="font-semibold">{t('todaysFocus')}</h2>
        <span className="ms-auto text-xs text-muted">{formatDate(locale, new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <ChevronDown className={clsx('size-4 transition-transform sm:hidden', open && 'rotate-180')} />
      </button>
      <div className={clsx(!open && 'hidden sm:block')}>
        <ul className="mt-3 space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="group flex min-h-8 items-center gap-2 text-sm">
              <input type="checkbox" checked={i.done} onChange={(e) => run(() => toggleFocusAction(i.id, e.target.checked))} className="size-4.5 shrink-0 accent-[var(--brand)]" />
              <span className={clsx('flex-1', i.done && 'text-muted line-through')} dir="auto">{i.text}</span>
              <button type="button" onClick={() => run(() => deleteFocusAction(i.id))} className="text-muted opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="delete"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { const v = text; setText(''); run(() => addFocusAction(v)); } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('addFocus')} className="input min-h-9 text-xs" dir="auto" />
          <button className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-label={t('addFocus')}><Plus className="size-4" /></button>
        </form>
        <div className="mt-2 text-xs text-muted">{formatNumber(locale, done)}/{formatNumber(locale, items.length)}</div>
      </div>
      <svg viewBox="0 0 60 80" className="pointer-events-none absolute bottom-0 end-2 h-20 opacity-90" aria-hidden>
        <path d="M18 58h24l-3 20H21z" fill="#e8d7bf" />
        <path d="M30 58C30 40 22 30 14 24M30 58c0-16 8-28 18-34M30 58V20" stroke="var(--brand)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="14" cy="24" rx="8" ry="4" transform="rotate(-35 14 24)" fill="var(--brand)" opacity=".8" />
        <ellipse cx="48" cy="24" rx="8" ry="4" transform="rotate(35 48 24)" fill="var(--brand)" opacity=".8" />
        <ellipse cx="30" cy="16" rx="4" ry="8" fill="var(--brand)" />
      </svg>
    </section>
  );
}
