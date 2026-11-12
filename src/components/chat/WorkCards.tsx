'use client';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, CalendarClock, ListChecks, Bug, Ban } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { moveTaskAction } from '@/app/actions/tasks';
import { updateIssueAction } from '@/app/actions/command';
import { TASK_COLUMNS, ISSUE_STATUSES, type Issue, type IssueStatus, type Message, type Task, type TaskColumn } from '@/lib/data/types';
import { COLUMN_STYLE, TONE, PriorityChip, EffortChip } from '@/components/icons/options';
import { SeverityBadge, IssueStatusBadge } from '@/components/command/badges';
import { daysFromToday, formatDate, formatNumber } from '@/lib/format';
import { DoneGlyph, TrophyGlyph } from '@/components/icons/glyphs';
import { systemData } from './preview';

// A live task card in the chat: its stage as four icon buttons (tap to move it right here), who has it,
// when it is due and its steps. It updates with the board.
export function TaskCardMsg({ task, title }: { task: Task | null; title: string }) {
  const t = useTranslations('tasks');
  const tc = useTranslations('chatPage');
  const locale = useLocale();
  const { profiles } = useShell();
  const [column, setColumn] = useState<TaskColumn | null>(null);
  const [, start] = useTransition();
  if (!task) return <div className="p-3 text-sm text-muted">{tc('card.gone', { title })}</div>;
  const col = column ?? task.column;
  const assignee = profiles.find((p) => p.id === task.assigneeId) ?? null;
  const steps = task.checklist.length ? task.checklist.filter((s) => s.done).length / task.checklist.length : null;
  const late = task.dueDate && col !== 'done' && daysFromToday(task.dueDate) < 0;
  const move = (c: TaskColumn) => {
    if (c === col) return;
    setColumn(c);
    navigator.vibrate?.(8);
    start(async () => { const r = await moveTaskAction(task.id, c); if (!r.ok) setColumn(null); });
  };
  const tone = TONE[COLUMN_STYLE[col].tone];
  return (
    <div>
      <div className={clsx('flex items-center gap-2 px-3 py-2 text-[11px] font-bold tracking-wide uppercase', tone.tile, tone.ink)}>
        {COLUMN_STYLE[col].icon('size-4')}{tc('card.task')} · {t(`col_${col}`)}
        <Link href={`/tasks?task=${task.id}`} className="ms-auto flex size-7 items-center justify-center rounded-full hover:bg-black/10" aria-label={tc('card.open')} onClick={(e) => e.stopPropagation()}><ArrowUpRight className="size-4" /></Link>
      </div>
      <div className="space-y-2 px-3 pt-2 pb-1">
        <div className={clsx('font-semibold leading-6', col === 'done' && 'text-muted line-through')} dir="auto">{task.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {assignee ? <span className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pe-2 ps-0.5"><Avatar profile={assignee} size="sm" />{assignee.displayName}</span>
            : <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">{t('unassignedShort')}</span>}
          {task.priority > 0 && <PriorityChip priority={task.priority} />}
          <EffortChip effort={task.effort} />
          {task.dueDate && <span className={clsx('flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1', late ? 'text-danger' : 'text-muted')}><CalendarClock className="size-3.5" />{formatDate(locale, `${task.dueDate}T12:00:00Z`)}</span>}
          {task.blockedReason && <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-danger"><Ban className="size-3.5" />{t('blocked')}</span>}
        </div>
        {steps !== null && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <ListChecks className="size-3.5" />
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-brand" style={{ width: `${steps * 100}%` }} /></span>
            {formatNumber(locale, task.checklist.filter((s) => s.done).length)}/{formatNumber(locale, task.checklist.length)}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 p-2" role="radiogroup" aria-label={t('column')}>
        {TASK_COLUMNS.map((c) => {
          const on = c === col;
          const s = COLUMN_STYLE[c];
          return (
            <button key={c} type="button" role="radio" aria-checked={on} title={t(`col_${c}`)} onClick={(e) => { e.stopPropagation(); move(c); }}
              onPointerDown={(e) => e.stopPropagation()}
              className={clsx('flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-[10px] font-semibold transition active:scale-95',
                on ? clsx(TONE[s.tone].tile, TONE[s.tone].ring, TONE[s.tone].ink) : 'border-transparent bg-surface-2/70 text-muted hover:text-ink')}>
              <span className={clsx(on && 'gc-pop')}>{s.icon('size-5')}</span><span className="max-w-full truncate px-0.5">{t(`col_${c}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A bug card: severity, status (tap to change), who fixes it.
export function IssueCardMsg({ issue, title }: { issue: Issue | null; title: string }) {
  const t = useTranslations('command');
  const tc = useTranslations('chatPage');
  const { profiles } = useShell();
  const [status, setStatus] = useState<IssueStatus | null>(null);
  const [, start] = useTransition();
  if (!issue) return <div className="p-3 text-sm text-muted">{tc('card.gone', { title })}</div>;
  const st = status ?? issue.status;
  const assignee = profiles.find((p) => p.id === issue.assigneeId) ?? null;
  const set = (s: IssueStatus) => {
    if (s === st) return;
    setStatus(s);
    start(async () => { const r = await updateIssueAction(issue.id, { status: s }); if (!r.ok) setStatus(null); });
  };
  return (
    <div>
      <div className="flex items-center gap-2 bg-[#fde4e4] px-3 py-2 text-[11px] font-bold tracking-wide text-[#c24141] uppercase dark:bg-[#3d2121] dark:text-[#f2a0a0]">
        <Bug className="size-4" />{tc('card.issue')}
        <Link href={`/projects/${issue.projectId}?tab=issues`} className="ms-auto flex size-7 items-center justify-center rounded-full hover:bg-black/10" aria-label={tc('card.open')} onClick={(e) => e.stopPropagation()}><ArrowUpRight className="size-4" /></Link>
      </div>
      <div className="space-y-2 px-3 pt-2 pb-1">
        <div className={clsx('font-semibold leading-6', (st === 'fixed' || st === 'closed') && 'text-muted line-through')} dir="auto">{issue.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <SeverityBadge severity={issue.severity} />
          <IssueStatusBadge status={st} />
          {assignee && <span className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pe-2 ps-0.5"><Avatar profile={assignee} size="sm" />{assignee.displayName}</span>}
        </div>
      </div>
      <div className="flex gap-1 p-2">
        {ISSUE_STATUSES.map((s) => (
          <button key={s} type="button" onClick={(e) => { e.stopPropagation(); set(s); }} onPointerDown={(e) => e.stopPropagation()}
            className={clsx('min-h-10 flex-1 rounded-xl px-1 text-[11px] font-semibold transition active:scale-95', s === st ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>
            {t(`istatus.${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// The app's own lines in a project topic (a task finished, a milestone reached, a bug fixed).
export function SystemLine({ m }: { m: Message }) {
  const t = useTranslations('chatPage');
  const { profiles } = useShell();
  const d = systemData(m);
  if (!d) return null;
  const name = profiles.find((p) => p.id === m.authorId)?.displayName ?? '—';
  const Icon = d.e === 'milestone_done' ? TrophyGlyph : d.e === 'issue_fixed' ? Bug : DoneGlyph;
  return (
    <div data-mid={m.id} className="my-2 flex justify-center px-4">
      <span className={clsx('flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium text-white backdrop-blur',
        d.e === 'milestone_done' ? 'bg-[#b8860b]/80' : 'bg-black/35 dark:bg-white/15')}>
        <Icon className="size-4 shrink-0" /><span className="truncate" dir="auto">{t(`sys.${d.e}`, { name, title: d.title })}</span>
        {d.e === 'milestone_done' && <span aria-hidden>🎉</span>}
      </span>
    </div>
  );
}
