'use client';
import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CalendarDays, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TONE, type Tone } from '@/components/icons/options';
import { addDays } from '@/lib/todos';
import { formatDate, todayIso } from '@/lib/format';
import type { Profile } from '@/lib/data/types';

export interface Choice<V extends string | number> { value: V; label: string; icon: ReactNode; tone?: Tone; hint?: string }

// A row of icon tiles to pick one option with a tap (instead of a drop-down list). With `name` it also
// fills a hidden form field, so it works inside server-action forms. Controlled or not.
export function IconChoice<V extends string | number>({ name, options, value, defaultValue, onChange, size = 'md', label, className }: {
  name?: string; options: Choice<V>[]; value?: V; defaultValue?: V; onChange?: (v: V) => void; size?: 'sm' | 'md'; label?: string; className?: string;
}) {
  const [own, setOwn] = useState<V | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? own;
  const [popped, setPopped] = useState<V | null>(null);
  const pick = (v: V) => { setOwn(v); setPopped(v); onChange?.(v); };
  return (
    <div className={className}>
      {label && <div className="label">{label}</div>}
      {name && <input type="hidden" name={name} value={String(current ?? '')} />}
      <div role="radiogroup" aria-label={label} className={clsx('flex flex-wrap', size === 'sm' ? 'gap-1.5' : 'gap-2')}>
        {options.map((o) => {
          const on = o.value === current;
          const tone = TONE[o.tone ?? 'brand'];
          return (
            <button key={String(o.value)} type="button" role="radio" aria-checked={on} title={o.hint ?? o.label} onClick={() => pick(o.value)}
              className={clsx('relative flex select-none flex-col items-center justify-center border-2 font-medium transition-[transform,background-color,border-color] duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]',
                size === 'sm' ? 'min-h-11 min-w-14 gap-0.5 rounded-xl px-2 py-1 text-[11px]' : 'min-h-[4.25rem] min-w-[4.6rem] flex-1 gap-1 rounded-2xl px-2 py-2 text-xs sm:flex-none',
                on ? clsx(tone.tile, tone.ring, tone.ink) : 'border-transparent bg-surface-2 text-muted hover:text-ink')}>
              <span className={clsx('flex items-center justify-center', on && popped === o.value && 'gc-pop', on ? tone.ink : 'opacity-80')}>{o.icon}</span>
              <span className="max-w-20 truncate">{o.label}</span>
              {on && size === 'md' && <span className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-current"><Check className="size-3 text-surface" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Pick a person by their portrait (or nobody). Multiple: a team.
export function AvatarChoice({ name, profiles, value, defaultValue, onChange, multiple, allowNone, noneLabel, label }: {
  name?: string; profiles: Profile[]; value?: string[]; defaultValue?: string[]; onChange?: (ids: string[]) => void;
  multiple?: boolean; allowNone?: boolean; noneLabel?: string; label?: string;
}) {
  const [own, setOwn] = useState<string[]>(defaultValue ?? []);
  const current = value ?? own;
  const set = (ids: string[]) => { setOwn(ids); onChange?.(ids); };
  const toggle = (id: string) => {
    if (!multiple) { set(current[0] === id && allowNone ? [] : [id]); return; }
    set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };
  return (
    <div>
      {label && <div className="label">{label}</div>}
      {name && (multiple ? current.map((id) => <input key={id} type="hidden" name={name} value={id} />) : <input type="hidden" name={name} value={current[0] ?? ''} />)}
      <div className="flex flex-wrap gap-2">
        {allowNone && !multiple && (
          <button type="button" onClick={() => set([])} aria-pressed={!current.length}
            className={clsx('flex min-h-16 w-[4.6rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 text-[11px] font-medium transition active:scale-95',
              !current.length ? 'border-muted/50 bg-surface-2 text-ink' : 'border-transparent bg-surface-2 text-muted')}>
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-muted/60"><X className="size-4" /></span>
            <span className="max-w-16 truncate">{noneLabel}</span>
          </button>
        )}
        {profiles.map((p) => {
          const on = current.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on}
              className={clsx('relative flex min-h-16 w-[4.6rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 text-[11px] font-medium transition active:scale-95',
                on ? 'border-brand/60 bg-brand-soft text-brand' : 'border-transparent bg-surface-2 text-muted hover:text-ink')}>
              <span className={clsx('rounded-full transition', on && 'gc-pop ring-2 ring-brand ring-offset-2 ring-offset-brand-soft')}><Avatar profile={p} size="sm" /></span>
              <span className="max-w-16 truncate">{p.displayName}</span>
              {on && multiple && <span className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-brand text-brand-ink"><Check className="size-3" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A due date in one tap: none, today, tomorrow, in a week, or any date.
export function DueChoice({ name, defaultValue, value, onChange, label }: { name?: string; defaultValue?: string | null; value?: string | null; onChange?: (d: string | null) => void; label?: string }) {
  const t = useTranslations('common');
  const tt = useTranslations('tasks');
  const locale = useLocale();
  const [own, setOwn] = useState<string | null>(defaultValue ?? null);
  const current = value !== undefined ? value : own;
  const today = todayIso();
  const set = (d: string | null) => { setOwn(d); onChange?.(d); };
  const quick: [string, string | null][] = [[tt('noDue'), null], [t('today'), today], [t('tomorrow'), addDays(today, 1)], [tt('nextWeek'), addDays(today, 7)]];
  const custom = current && !quick.some(([, d]) => d === current);
  return (
    <div>
      {label && <div className="label">{label}</div>}
      {name && <input type="hidden" name={name} value={current ?? ''} />}
      <div className="flex flex-wrap items-center gap-1.5">
        {quick.map(([l, d]) => (
          <button key={l} type="button" onClick={() => set(d)} aria-pressed={current === d}
            className={clsx('min-h-10 rounded-full border-2 px-3 text-xs font-medium transition active:scale-95', current === d ? 'border-brand/60 bg-brand-soft text-brand' : 'border-transparent bg-surface-2 text-muted hover:text-ink')}>{l}</button>
        ))}
        <label className={clsx('relative flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 text-xs font-medium', custom ? 'border-brand/60 bg-brand-soft text-brand' : 'border-transparent bg-surface-2 text-muted')}>
          <CalendarDays className="size-4" />
          {custom ? formatDate(locale, `${current}T12:00:00Z`, { day: 'numeric', month: 'short' }) : tt('pickDate')}
          <input type="date" value={current ?? ''} onChange={(e) => set(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={tt('pickDate')} />
        </label>
      </div>
    </div>
  );
}
