'use client';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { createEventAction, deleteEventAction } from '@/app/actions/calendar';
import { formatDate, formatNumber, formatTime, todayIso as today, zonedDate } from '@/lib/format';
import { toGregorian, toJalali, jalaliMonthLength } from '@/lib/jalali';
import type { CalendarEvent, Task } from '@/lib/data/types';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

interface Cell { iso: string; day: number; inMonth: boolean }

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Month grid in the Persian calendar for fa (week starts Saturday) and Gregorian for en (week starts Monday).
function monthCells(locale: string, year: number, month: number): Cell[] {
  const persian = locale === 'fa';
  const length = persian ? jalaliMonthLength(year, month) : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = persian ? toGregorian(year, month, 1) : { gy: year, gm: month, gd: 1 };
  const firstDate = new Date(Date.UTC(first.gy, first.gm - 1, first.gd));
  const weekday = firstDate.getUTCDay(); // 0 = Sunday
  const lead = persian ? (weekday + 1) % 7 : (weekday + 6) % 7;
  const total = Math.ceil((lead + length) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(firstDate.getTime() + (i - lead) * 86400000);
    const g = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    const local = persian ? toJalali(g.y, g.m, g.d) : { jy: g.y, jm: g.m, jd: g.d };
    return { iso: iso(g.y, g.m, g.d), day: local.jd, inMonth: local.jm === month };
  });
}

export function CalendarView({ events, tasks }: { events: CalendarEvent[]; tasks: Task[] }) {
  const t = useTranslations('calendar');
  const tc = useTranslations('common');
  const locale = useLocale();
  const persian = locale === 'fa';
  const todayIso = today();
  const [ny, nm, nd] = todayIso.split('-').map(Number);
  const start = persian ? toJalali(ny, nm, nd) : { jy: ny, jm: nm };
  const [ym, setYm] = useState({ y: start.jy, m: start.jm });
  const [selected, setSelected] = useState(todayIso);
  const [adding, setAdding] = useState(false);
  const [, startT] = useTransition();
  const [state, action, pending] = useActionState(createEventAction, null);
  const status = useResultStatus(state);
  useEffect(() => { if (state?.ok) setAdding(false); }, [state]);

  const cells = useMemo(() => monthCells(locale, ym.y, ym.m), [locale, ym]);
  const shift = (delta: number) => setYm(({ y, m }) => { const k = y * 12 + (m - 1) + delta; return { y: Math.floor(k / 12), m: (k % 12) + 1 }; });
  // Event days in Tehran time (the stored values are UTC instants).
  const spans = useMemo(() => events.map((e) => ({ e, from: zonedDate(e.startsAt), to: zonedDate(e.endsAt) })), [events]);
  const dayEvents = (d: string) => spans.filter((x) => x.from <= d && x.to >= d).map((x) => x.e);
  const dayTasks = (d: string) => tasks.filter((x) => x.dueDate === d && x.column !== 'done');
  const headerDate = cells.find((c) => c.inMonth)!.iso;
  const weekdays = Array.from({ length: 7 }, (_, i) => formatDate(locale, new Date(Date.UTC(2024, 0, persian ? 6 + i : 1 + i)), { weekday: 'short' }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-lg font-semibold">{formatDate(locale, headerDate, { month: 'long', year: 'numeric' })}</h1>
          <div className="ms-auto flex gap-1">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={t('prev')}><ChevronRight className="size-5 ltr:rotate-180" /></button>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t('next')}><ChevronLeft className="size-5 ltr:rotate-180" /></button>
          </div>
          <button type="button" className="btn-primary min-h-10" onClick={() => setAdding(true)}><Plus className="size-4" />{t('newEvent')}</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const ev = dayEvents(c.iso), dt = dayTasks(c.iso);
            return (
              <button key={c.iso} type="button" onClick={() => setSelected(c.iso)}
                className={clsx('flex min-h-14 flex-col items-start rounded-xl p-1.5 text-start text-sm sm:min-h-20', c.inMonth ? 'bg-surface-2' : 'opacity-40',
                  selected === c.iso && 'ring-2 ring-brand', c.iso === todayIso && 'font-bold text-accent')}>
                <span>{formatNumber(locale, c.day)}</span>
                <span className="mt-auto flex flex-wrap gap-0.5">
                  {ev.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full bg-teal" />)}
                  {dt.slice(0, 3).map((x) => <span key={x.id} className="size-1.5 rounded-full bg-accent" />)}
                </span>
                <span className="hidden w-full truncate text-[10px] text-muted sm:block">{ev[0]?.title ?? dt[0]?.title ?? ''}</span>
              </button>
            );
          })}
        </div>
      </section>
      <aside className="card p-4">
        <h2 className="mb-3 font-semibold">{formatDate(locale, selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <ul className="space-y-2">
          {dayEvents(selected).map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-xl bg-teal-soft px-3 py-2 text-sm">
              <span className="flex-1" dir="auto">{e.title}</span>
              <span className="text-xs text-muted" dir="ltr">{formatTime(locale, e.startsAt)}–{formatTime(locale, e.endsAt)}</span>
              <button type="button" aria-label={tc('delete')} className="text-muted hover:text-danger" onClick={() => startT(async () => { await deleteEventAction(e.id); })}><Trash2 className="size-4" /></button>
            </li>
          ))}
          {dayTasks(selected).map((x) => <li key={x.id} className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{t('due', { title: x.title })}</li>)}
          {!dayEvents(selected).length && !dayTasks(selected).length && <li className="text-sm text-muted">{t('empty')}</li>}
        </ul>
      </aside>
      <Dialog open={adding} onClose={() => setAdding(false)} title={t('newEvent')}>
        <form action={action} className="space-y-3">
          <div><label className="label">{t('eventTitle')}</label><input name="title" required className="input" dir="auto" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">{t('starts')}</label><input type="datetime-local" name="startsAt" required defaultValue={`${selected}T10:00`} className="input" /></div>
            <div><label className="label">{t('ends')}</label><input type="datetime-local" name="endsAt" defaultValue={`${selected}T11:00`} className="input" /></div>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>{tc('cancel')}</button><SaveButton pending={pending} status={status}>{tc('save')}</SaveButton></div>
        </form>
      </Dialog>
    </div>
  );
}
