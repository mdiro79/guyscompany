'use client';
import { useOptimistic, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Flag, ListChecks, MoreVertical, Ban, Pencil, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useProfile, useShell } from '@/components/shell/ShellContext';
import { moveTaskAction, deleteTaskAction, volunteerTaskAction, toggleStepAction } from '@/app/actions/tasks';
import { daysFromToday, formatNumber, tagColor } from '@/lib/format';
import { TASK_COLUMNS, type Milestone, type Task } from '@/lib/data/types';
import { COLUMN_STYLE, TONE, PriorityChip, EffortChip } from '@/components/icons/options';

export function useDueLabel() {
  const t = useTranslations('common');
  const locale = useLocale();
  return (date: string | null) => {
    if (!date) return '';
    const d = daysFromToday(date);
    if (d === 0) return t('today');
    if (d === 1) return t('tomorrow');
    return d < 0 ? t('daysAgo', { n: formatNumber(locale, -d) }) : t('inDays', { n: formatNumber(locale, d) });
  };
}

export function TaskCard({ task, onEdit, draggable, milestone }: { task: Task; onEdit: () => void; draggable?: boolean; milestone?: Milestone }) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const { user } = useShell();
  const assignee = useProfile(task.assigneeId);
  const due = useDueLabel();
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const overdue = task.dueDate && task.column !== 'done' && daysFromToday(task.dueDate) < 0;
  // Steps tick at once and settle with the server's answer.
  const locale = useLocale();
  const [openSteps, setOpenSteps] = useState(false);
  const [steps, setSteps] = useOptimistic(task.checklist ?? []);
  const doneSteps = steps.filter((s) => s.done).length;
  const tick = (i: number, done: boolean) => start(async () => {
    setSteps(steps.map((s, j) => (j === i ? { ...s, done } : s)));
    await toggleStepAction(task.id, i, done);
  });

  return (
    <article draggable={draggable} onDragStart={(e) => e.dataTransfer.setData('text/task', task.id)}
      className={clsx('group relative rounded-xl border bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-brand/40', task.blockedReason && task.column !== 'done' ? 'border-danger/40' : 'border-line')}>
      {task.blockedReason && task.column !== 'done' && (
        <div className="-mx-3 -mt-3 mb-2 flex items-center gap-1.5 rounded-t-xl bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger" title={task.blockedReason}>
          <Ban className="size-3.5 shrink-0" /><span className="truncate" dir="auto">{t('blocked')}: {task.blockedReason}</span>
        </div>
      )}
      <button type="button" onClick={onEdit} className="block w-full text-start">
        <h3 className="text-sm font-semibold leading-5" dir="auto">{task.title}</h3>
        {task.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted" dir="auto">{task.description}</p>}
      </button>
      {steps.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setOpenSteps((x) => !x)} aria-expanded={openSteps} className="flex min-h-8 w-full items-center gap-2 text-xs text-muted">
            <ListChecks className="size-3.5 shrink-0" />
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${(doneSteps / steps.length) * 100}%` }} /></span>
            <span className="tabular-nums">{formatNumber(locale, doneSteps)}/{formatNumber(locale, steps.length)}</span>
            <ChevronDown className={clsx('size-3.5 shrink-0 transition-transform', openSteps && 'rotate-180')} />
          </button>
          {openSteps && (
            <ul className="mt-1 space-y-0.5">
              {steps.map((s, i) => (
                <li key={i}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-1 text-xs hover:bg-surface-2">
                    <input type="checkbox" checked={s.done} onChange={(e) => tick(i, e.target.checked)} className="size-4 shrink-0 accent-[var(--color-brand)]" />
                    <span dir="auto" className={clsx('min-w-0 break-words', s.done && 'text-muted line-through')}>{s.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {task.priority > 0 && <PriorityChip priority={task.priority} />}
        <EffortChip effort={task.effort} />
        {milestone && <span className="chip gap-1 bg-surface-2 text-muted" title={t('phase')}><Flag className="size-3 text-accent" /><span className="max-w-28 truncate" dir="auto">{milestone.title}</span></span>}
        {task.tags.map((tag) => <span key={tag} className={clsx('chip', tagColor(tag))}>{tag}</span>)}
        {task.needsVolunteer && <span className="chip bg-accent-soft text-accent ring-1 ring-accent/30">{t('needsVolunteer')}</span>}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        {assignee ? <span className="flex min-w-0 items-center gap-1.5" title={assignee.displayName}><Avatar profile={assignee} size="sm" /><span className="hidden truncate text-ink 2xl:inline">{assignee.displayName}</span></span> : !task.needsVolunteer && <span className="truncate">{tc('unassigned')}</span>}
        {task.dueDate && <span className={clsx('ms-1 whitespace-nowrap', overdue && 'text-danger')}>{due(task.dueDate)}</span>}
        {task.needsVolunteer && !task.assigneeId && (
          <button type="button" className="ms-auto whitespace-nowrap rounded-lg bg-accent px-2 py-1 text-[11px] font-medium text-white" onClick={() => run(() => volunteerTaskAction(task.id))}>{t('volunteer')}</button>
        )}
        <div className="relative ms-auto">
          <button type="button" aria-label={tc('more')} className="flex size-8 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => setMenu((x) => !x)}><MoreVertical className="size-4" /></button>
          {menu && (
            <div className="card gc-menu absolute end-0 top-9 z-20 w-56 p-1.5 text-sm text-ink" onMouseLeave={() => setMenu(false)}>
              <div className="px-1.5 pb-1 text-[11px] text-muted">{t('moveTo')}</div>
              <div className="grid grid-cols-4 gap-1">
                {TASK_COLUMNS.map((c) => {
                  const on = c === task.column;
                  const tone = TONE[COLUMN_STYLE[c].tone];
                  return (
                    <button key={c} type="button" title={t(`col_${c}`)} aria-label={t(`col_${c}`)} disabled={on}
                      onClick={() => { setMenu(false); run(() => moveTaskAction(task.id, c)); }}
                      className={clsx('flex aspect-square flex-col items-center justify-center rounded-xl border-2 transition active:scale-90', on ? clsx(tone.tile, tone.ring, tone.ink) : 'border-transparent bg-surface-2 text-muted hover:text-ink')}>
                      {COLUMN_STYLE[c].icon('size-6')}
                    </button>
                  );
                })}
              </div>
              <div className="my-1.5 border-t border-line" />
              <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 hover:bg-surface-2" onClick={() => { setMenu(false); onEdit(); }}><Pencil className="size-4" />{tc('edit')}</button>
              {(user.role === 'admin' || task.createdBy === user.id) && (
                <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-danger hover:bg-surface-2"
                  onClick={() => { setMenu(false); if (confirm(t('confirmDelete'))) run(() => deleteTaskAction(task.id)); }}><Trash2 className="size-4" />{tc('delete')}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
