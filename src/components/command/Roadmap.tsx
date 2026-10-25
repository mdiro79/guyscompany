'use client';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, Plus, Trash2, Check } from 'lucide-react';
import { createMilestoneAction, toggleMilestoneAction, deleteMilestoneAction } from '@/app/actions/command';
import { formatDate, zonedDate } from '@/lib/format';
import { addDays } from '@/lib/todos';
import type { Milestone, Project, Task } from '@/lib/data/types';

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const COLUMN_COLOR: Record<Task['column'], string> = { idea: 'var(--viz-s0)', in_progress: 'var(--viz-s1)', review: 'var(--viz-s2)', done: 'var(--viz-s3)' };

// One shared time axis for milestones and task bars, flowing with the reading direction.
function useAxis(dates: string[], today: string) {
  const from = addDays(dates.reduce((a, b) => (b < a ? b : a), today), -2);
  const to = addDays(dates.reduce((a, b) => (b > a ? b : a), addDays(today, 7)), 2);
  const span = Math.max(1, day(to) - day(from));
  return { from, to, at: (d: string) => ((day(d) - day(from)) / span) * 100 };
}

export function Roadmap({ project, tasks, milestones, canManage, today }: { project: Project; tasks: Task[]; milestones: Milestone[]; canManage: boolean; today: string }) {
  const t = useTranslations('command');
  const tt = useTranslations('tasks');
  const locale = useLocale();
  const [, start] = useTransition();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const dated = tasks.filter((x) => x.startDate || x.dueDate);
  const ms = [...milestones].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const axis = useAxis([
    zonedDate(project.createdAt), ...(project.dueDate ? [project.dueDate] : []),
    ...ms.flatMap((m) => (m.dueDate ? [m.dueDate] : [])), ...dated.flatMap((x) => [x.startDate, x.dueDate].filter((d): d is string => !!d)),
  ], today);
  const fmt = (d: string) => formatDate(locale, `${d}T12:00:00Z`, { day: 'numeric', month: 'short' });
  // Month-ish ticks: about five evenly spaced dates.
  const ticks = Array.from({ length: 5 }, (_, i) => addDays(axis.from, Math.round(((day(axis.to) - day(axis.from)) * i) / 4)));

  return (
    <div className="space-y-3">
      <section className="card p-3 sm:p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Flag className="size-4" />{t('milestones')}</h2>
        {/* Timeline strip */}
        <div className="relative mb-4 h-16">
          <div className="absolute inset-x-0 top-8 h-1 rounded-full bg-surface-2" />
          {project.dueDate && <div className="absolute top-6 h-5 w-0.5 bg-danger/60" style={{ insetInlineStart: `${axis.at(project.dueDate)}%` }} title={t('due')} />}
          <div className="absolute top-4 bottom-2 w-0.5 bg-brand" style={{ insetInlineStart: `${axis.at(today)}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-brand">{t('today')}</span>
          </div>
          {ms.filter((m) => m.dueDate).map((m) => {
            const late = !m.done && m.dueDate! < today;
            return (
              <div key={m.id} className="absolute top-[26px] -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${axis.at(m.dueDate!)}%` }} title={`${m.title} · ${fmt(m.dueDate!)}`}>
                <span className={clsx('block size-3.5 rotate-45 rounded-sm border-2 border-surface', m.done ? 'bg-brand' : late ? 'bg-danger' : 'bg-accent')} />
              </div>
            );
          })}
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-muted">{ticks.map((d) => <span key={d}>{fmt(d)}</span>)}</div>
        </div>
        {ms.length === 0 && <p className="py-4 text-center text-sm text-muted">{t('milestonesEmpty')}</p>}
        <ul className="space-y-1.5">
          {ms.map((m) => {
            const late = !m.done && !!m.dueDate && m.dueDate < today;
            return (
              <li key={m.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <button type="button" disabled={!canManage} aria-pressed={m.done} aria-label={m.title}
                  onClick={() => start(async () => { await toggleMilestoneAction(m.id, !m.done); })}
                  className={clsx('flex size-6 shrink-0 items-center justify-center rounded-md border-2', m.done ? 'border-brand bg-brand text-brand-ink' : 'border-line', canManage && 'hover:border-brand')}>
                  {m.done && <Check className="size-3.5" />}
                </button>
                <span className={clsx('min-w-0 flex-1 truncate', m.done && 'text-muted line-through')} dir="auto">{m.title}</span>
                <span className={clsx('text-xs', late ? 'font-semibold text-danger' : 'text-muted')}>{m.dueDate ? fmt(m.dueDate) : t('noDue')}</span>
                {canManage && (
                  <button type="button" className="icon-btn size-8 text-muted hover:text-danger" aria-label={t('delete')}
                    onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteMilestoneAction(m.id); }); }}><Trash2 className="size-3.5" /></button>
                )}
              </li>
            );
          })}
        </ul>
        {canManage ? (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault(); const v = title.trim(); if (!v) return; const d = due || null; setTitle(''); setDue('');
            start(async () => { await createMilestoneAction(project.id, v, d); });
          }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('milestonePh')} maxLength={120} className="input min-w-40 flex-1" dir="auto" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input w-auto" aria-label={t('due')} />
            <button className="btn-primary" disabled={!title.trim()}><Plus className="size-4" />{t('addMilestone')}</button>
          </form>
        ) : <p className="mt-3 text-xs text-muted">{t('only')}</p>}
      </section>

      <section className="card p-3 sm:p-4">
        <h2 className="mb-3 font-semibold">{t('timeline')}</h2>
        {dated.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t('noDates')}</p> : (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="w-[38%] shrink-0 sm:w-[30%]" />
              <div className="flex flex-1 justify-between text-[10px] text-muted">{ticks.map((d) => <span key={d}>{fmt(d)}</span>)}</div>
            </div>
            {dated.sort((a, b) => (a.startDate ?? a.dueDate!).localeCompare(b.startDate ?? b.dueDate!)).map((x) => {
              const s = x.startDate ?? x.dueDate!, e = x.dueDate ?? x.startDate!;
              const late = x.column !== 'done' && !!x.dueDate && x.dueDate < today;
              return (
                <div key={x.id} className="flex items-center gap-2 text-xs">
                  <span className="w-[38%] shrink-0 truncate sm:w-[30%]" dir="auto" title={x.title}>{x.title}</span>
                  <div className="relative h-5 flex-1 rounded-md bg-surface-2/60">
                    <div className="absolute inset-y-0 w-px bg-brand/70" style={{ insetInlineStart: `${axis.at(today)}%` }} />
                    <div className={clsx('absolute inset-y-0.5 rounded', late && 'ring-2 ring-danger')} title={`${tt(`col_${x.column}`)} · ${fmt(s)} – ${fmt(e)}`}
                      style={{ insetInlineStart: `${axis.at(s)}%`, width: `max(6px, ${axis.at(addDays(e, 1)) - axis.at(s)}%)`, background: COLUMN_COLOR[x.column] }} />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-muted">
              {(Object.keys(COLUMN_COLOR) as Task['column'][]).map((c) => (
                <span key={c} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: COLUMN_COLOR[c] }} />{tt(`col_${c}`)}</span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
