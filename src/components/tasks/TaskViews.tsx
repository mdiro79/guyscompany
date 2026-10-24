'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, List, GanttChart, Plus, Lightbulb, RefreshCw, Eye, CheckCircle2, CalendarRange } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useProfile, useShell } from '@/components/shell/ShellContext';
import { moveTaskAction } from '@/app/actions/tasks';
import { formatDate, tagColor } from '@/lib/format';
import { TASK_COLUMNS, type Project, type Task, type TaskColumn } from '@/lib/data/types';
import { TaskCard, useDueLabel } from './TaskCard';
import { TaskDialog } from './TaskDialog';

type View = 'board' | 'list' | 'timeline';

const COL_STYLE: Record<TaskColumn, { icon: typeof Lightbulb; bg: string; fg: string }> = {
  idea: { icon: Lightbulb, bg: 'bg-accent-soft/50', fg: 'text-accent' },
  in_progress: { icon: RefreshCw, bg: 'bg-[#e6eefb] dark:bg-[#1c2636]', fg: 'text-[#3567c4] dark:text-[#8fb3f2]' },
  review: { icon: Eye, bg: 'bg-[#fdf1e6] dark:bg-[#33261b]', fg: 'text-accent' },
  done: { icon: CheckCircle2, bg: 'bg-brand-soft/70', fg: 'text-brand' },
};

export function TaskViews({ tasks, projects, compact }: { tasks: Task[]; projects: Project[]; compact?: boolean }) {
  const t = useTranslations('tasks');
  const params = useSearchParams();
  const { user } = useShell();
  const [view, setView] = useState<View>('board');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<TaskColumn | null>(null);
  const [mine, setMine] = useState(false);
  const [mobileCol, setMobileCol] = useState<TaskColumn>('idea');
  // ?project=<id> (from a project's command center) narrows the board to that project.
  const projectId = params.get('project');
  const shown = useMemo(() => tasks.filter((x) => (!mine || x.assigneeId === user.id) && (!projectId || x.projectId === projectId)), [tasks, mine, user.id, projectId]);

  useEffect(() => {
    const id = params.get('task');
    const found = id && tasks.find((x) => x.id === id);
    if (found) setEditing(found);
  }, [params, tasks]);

  const views: [View, typeof List, string][] = [['board', LayoutGrid, t('board')], ['list', List, t('list')], ['timeline', GanttChart, t('timeline')]];
  return (
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarRange className="size-5" />{t('title')}</h2>
        <div className="ms-auto flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          {views.map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={clsx('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm', view === v ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink')}>
              <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {!compact && (
          <label className="flex min-h-9 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-[var(--brand)]" />{t('filterMine')}</label>
        )}
        <button type="button" className="btn-primary min-h-10" onClick={() => setCreating('idea')}><Plus className="size-4" />{t('newTask')}</button>
      </div>

      {view === 'board' && (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto md:hidden" role="tablist">
            {TASK_COLUMNS.map((c) => (
              <button key={c} role="tab" type="button" aria-selected={mobileCol === c} onClick={() => setMobileCol(c)}
                className={clsx('flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm', mobileCol === c ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>
                {t(`col_${c}`)}<span className="text-xs opacity-80">{shown.filter((x) => x.column === c).length}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TASK_COLUMNS.map((c) => (
              <Column key={c} column={c} tasks={shown.filter((x) => x.column === c)} hiddenOnMobile={mobileCol !== c}
                onEdit={setEditing} onAdd={() => setCreating(c)} />
            ))}
          </div>
        </>
      )}
      {view === 'list' && <ListView tasks={shown} projects={projects} onEdit={setEditing} />}
      {view === 'timeline' && <Timeline tasks={shown} onEdit={setEditing} />}

      <TaskDialog open={!!editing} task={editing} projects={projects} onClose={() => setEditing(null)} />
      <TaskDialog open={!!creating} task={null} projects={projects} defaultColumn={creating ?? 'idea'} onClose={() => setCreating(null)} />
    </section>
  );
}

function Column({ column, tasks, hiddenOnMobile, onEdit, onAdd }: { column: TaskColumn; tasks: Task[]; hiddenOnMobile: boolean; onEdit: (t: Task) => void; onAdd: () => void }) {
  const t = useTranslations('tasks');
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  const { icon: Icon, bg, fg } = COL_STYLE[column];
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData('text/task'); if (id) start(async () => { await moveTaskAction(id, column); }); }}
      className={clsx('rounded-2xl p-2.5 transition-shadow', bg, hiddenOnMobile && 'hidden md:block', over && 'ring-2 ring-brand')}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className={clsx('size-5', fg)} />
        <h3 className={clsx('font-semibold', column === 'in_progress' && fg)}>{t(`col_${column}`)}</h3>
        <span className="ms-auto text-sm text-muted">{tasks.length}</span>
        <button type="button" onClick={onAdd} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label={t('newTask')}><Plus className="size-4" /></button>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && <p className="py-6 text-center text-xs text-muted">{t('empty')}</p>}
        {tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} draggable />)}
      </div>
    </div>
  );
}

function ListView({ tasks, projects, onEdit }: { tasks: Task[]; projects: Project[]; onEdit: (t: Task) => void }) {
  const t = useTranslations('tasks');
  const due = useDueLabel();
  return (
    <div className="space-y-4">
      {TASK_COLUMNS.map((c) => {
        const rows = tasks.filter((x) => x.column === c);
        if (!rows.length) return null;
        return (
          <div key={c}>
            <h3 className="mb-1 px-1 text-sm font-semibold text-muted">{t(`col_${c}`)} · {rows.length}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {rows.map((task) => <ListRow key={task.id} task={task} project={projects.find((p) => p.id === task.projectId)} due={due(task.dueDate)} onEdit={() => onEdit(task)} />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ListRow({ task, project, due, onEdit }: { task: Task; project?: Project; due: string; onEdit: () => void }) {
  const assignee = useProfile(task.assigneeId);
  return (
    <li>
      <button type="button" onClick={onEdit} className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-3 py-2 text-start hover:bg-surface-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">{task.title}</span>
        {project && <span className="hidden text-xs text-muted sm:inline">{project.name}</span>}
        <span className="hidden gap-1 md:flex">{task.tags.slice(0, 2).map((g) => <span key={g} className={clsx('chip', tagColor(g))}>{g}</span>)}</span>
        <span className="w-20 text-xs text-muted">{due}</span>
        {assignee && <Avatar profile={assignee} size="sm" />}
      </button>
    </li>
  );
}

function Timeline({ tasks, onEdit }: { tasks: Task[]; onEdit: (t: Task) => void }) {
  const locale = useLocale();
  const t = useTranslations('tasks');
  const DAYS = 28;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 7);
  const dayIndex = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - start.getTime()) / 86400000);
  const dated = tasks.filter((x) => x.startDate || x.dueDate).sort((a, b) => (a.startDate ?? a.dueDate!).localeCompare(b.startDate ?? b.dueDate!));
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 86400000));
  const todayCol = 7;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid border-b border-line pb-1 text-[10px] text-muted" style={{ gridTemplateColumns: `180px repeat(${DAYS}, 1fr)` }}>
          <div />
          {days.map((d, i) => <div key={i} className={clsx('text-center', i === todayCol && 'font-bold text-accent')}>{formatDate(locale, d, { day: 'numeric' })}</div>)}
        </div>
        {dated.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('noDates')}</p>}
        {dated.map((task) => {
          const s = Math.max(0, dayIndex(task.startDate ?? task.dueDate!));
          const e = Math.min(DAYS - 1, dayIndex(task.dueDate ?? task.startDate!));
          const visible = e >= 0 && s <= DAYS - 1 && e >= s;
          return (
            <div key={task.id} className="relative grid items-center border-b border-line/60 py-1.5" style={{ gridTemplateColumns: `180px repeat(${DAYS}, 1fr)` }}>
              <button type="button" onClick={() => onEdit(task)} className="truncate pe-2 text-start text-sm" dir="auto">{task.title}</button>
              {visible && (
                <button type="button" onClick={() => onEdit(task)} style={{ gridColumn: `${s + 2} / ${e + 3}` }}
                  className={clsx('h-6 rounded-full px-2 text-start text-[11px] font-medium text-white',
                    { idea: 'bg-accent', in_progress: 'bg-[#3567c4]', review: 'bg-[#d9902f]', done: 'bg-brand' }[task.column])}>
                  <span className="truncate">{t(`col_${task.column}`)}</span>
                </button>
              )}
              <div className="pointer-events-none absolute inset-y-0 w-px bg-accent/50" style={{ insetInlineStart: `calc(180px + (100% - 180px) * ${(todayCol + 0.5) / DAYS})` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
