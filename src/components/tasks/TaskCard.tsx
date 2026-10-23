'use client';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { MoreVertical } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useProfile, useShell } from '@/components/shell/ShellContext';
import { moveTaskAction, deleteTaskAction, volunteerTaskAction } from '@/app/actions/tasks';
import { daysFromToday, formatNumber, tagColor } from '@/lib/format';
import { TASK_COLUMNS, type Task } from '@/lib/data/types';

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

export function TaskCard({ task, onEdit, draggable }: { task: Task; onEdit: () => void; draggable?: boolean }) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const { user } = useShell();
  const assignee = useProfile(task.assigneeId);
  const due = useDueLabel();
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const overdue = task.dueDate && task.column !== 'done' && daysFromToday(task.dueDate) < 0;

  return (
    <article draggable={draggable} onDragStart={(e) => e.dataTransfer.setData('text/task', task.id)}
      className="group relative rounded-xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-brand/40">
      <button type="button" onClick={onEdit} className="block w-full text-start">
        <h3 className="text-sm font-semibold leading-5" dir="auto">{task.title}</h3>
        {task.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted" dir="auto">{task.description}</p>}
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
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
            <div className="card absolute end-0 top-9 z-20 w-44 p-1 text-sm text-ink" onMouseLeave={() => setMenu(false)}>
              <button type="button" className="flex min-h-10 w-full items-center rounded-lg px-3 hover:bg-surface-2" onClick={() => { setMenu(false); onEdit(); }}>{tc('edit')}</button>
              <div className="px-3 pt-1 text-[11px] text-muted">{t('moveTo')}</div>
              {TASK_COLUMNS.filter((c) => c !== task.column).map((c) => (
                <button key={c} type="button" className="flex min-h-10 w-full items-center rounded-lg px-3 hover:bg-surface-2" onClick={() => { setMenu(false); run(() => moveTaskAction(task.id, c)); }}>{t(`col_${c}`)}</button>
              ))}
              {(user.role === 'admin' || task.createdBy === user.id) && (
                <button type="button" className="flex min-h-10 w-full items-center rounded-lg px-3 text-danger hover:bg-surface-2"
                  onClick={() => { setMenu(false); if (confirm(t('confirmDelete'))) run(() => deleteTaskAction(task.id)); }}>{tc('delete')}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
