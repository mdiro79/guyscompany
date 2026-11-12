'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, List, GanttChart, Plus, CalendarRange, User, Ban, AlarmClock } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useProfile, useShell } from '@/components/shell/ShellContext';
import { moveTaskAction } from '@/app/actions/tasks';
import { formatDate, tagColor } from '@/lib/format';
import { TASK_COLUMNS, type Milestone, type Project, type Task, type TaskColumn } from '@/lib/data/types';
import { COLUMN_STYLE, TONE, ProjectIcon, PriorityChip } from '@/components/icons/options';
import { UrgentGlyph } from '@/components/icons/glyphs';
import { daysFromToday } from '@/lib/format';
import { TaskCard, useDueLabel } from './TaskCard';
import { TaskDialog } from './TaskDialog';

type View = 'board' | 'list' | 'timeline';

type Quick = 'mine' | 'urgent' | 'blocked' | 'overdue';
const QUICK: { key: Quick; icon: React.ReactNode; test: (t: Task, me: string) => boolean }[] = [
  { key: 'mine', icon: <User className="size-4" />, test: (t, me) => t.assigneeId === me },
  { key: 'urgent', icon: <UrgentGlyph className="size-4" />, test: (t) => t.priority === 2 },
  { key: 'blocked', icon: <Ban className="size-4" />, test: (t) => !!t.blockedReason && t.column !== 'done' },
  { key: 'overdue', icon: <AlarmClock className="size-4" />, test: (t) => !!t.dueDate && t.column !== 'done' && daysFromToday(t.dueDate) < 0 },
];

// Board, list and timeline of tasks. `projectId` fixes it to one project (the project's own page);
// otherwise ?project=<id> narrows it.
export function TaskViews({ tasks, projects, milestones = [], compact, projectId: fixedProject }: { tasks: Task[]; projects: Project[]; milestones?: Milestone[]; compact?: boolean; projectId?: string }) {
  const t = useTranslations('tasks');
  const params = useSearchParams();
  const { user } = useShell();
  const [view, setView] = useState<View>('board');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<TaskColumn | null>(null);
  const [quick, setQuick] = useState<Quick[]>([]);
  const [mobileCol, setMobileCol] = useState<TaskColumn>('in_progress');
  // ?project=<id> (from a project's command center) narrows the board to that project.
  const projectId = fixedProject ?? params.get('project');
  const shown = useMemo(() => tasks.filter((x) => (!projectId || x.projectId === projectId)
    && quick.every((q) => QUICK.find((f) => f.key === q)!.test(x, user.id))), [tasks, quick, user.id, projectId]);
  const toggleQuick = (q: Quick) => setQuick((l) => (l.includes(q) ? l.filter((x) => x !== q) : [...l, q]));
  const narrowed = !fixedProject && projectId ? projects.find((p) => p.id === projectId) : null;

  useEffect(() => {
    const id = params.get('task');
    const found = id && tasks.find((x) => x.id === id);
    if (found) setEditing(found);
  }, [params, tasks]);

  const closeEdit = useCallback(() => setEditing(null), []);
  const closeCreate = useCallback(() => setCreating(null), []);
  const views: [View, typeof List, string][] = [['board', LayoutGrid, t('board')], ['list', List, t('list')], ['timeline', GanttChart, t('timeline')]];
  return (
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {narrowed ? <ProjectIcon icon={narrowed.icon} color={narrowed.color} size="sm" /> : <CalendarRange className="size-5" />}{narrowed ? narrowed.name : t('title')}
        </h2>
        <div className="ms-auto flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          {views.map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={clsx('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm', view === v ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink')}>
              <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary min-h-10" onClick={() => setCreating('idea')}><Plus className="size-4" />{t('newTask')}</button>
      </div>
      {!compact && (
        <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          {QUICK.map((q) => {
            const on = quick.includes(q.key);
            const n = tasks.filter((x) => (!projectId || x.projectId === projectId) && q.test(x, user.id)).length;
            return (
              <button key={q.key} type="button" aria-pressed={on} onClick={() => toggleQuick(q.key)}
                className={clsx('flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-medium transition active:scale-95',
                  on ? 'border-brand/60 bg-brand-soft text-brand' : 'border-transparent bg-surface-2 text-muted hover:text-ink', q.key !== 'mine' && n > 0 && !on && q.key !== 'urgent' && 'text-danger')}>
                {q.icon}{t(`quick.${q.key}`)}<span className="text-xs opacity-80">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'board' && (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto md:hidden" role="tablist">
            {TASK_COLUMNS.map((c) => {
              const on = mobileCol === c;
              const tone = TONE[COLUMN_STYLE[c].tone];
              return (
                <button key={c} role="tab" type="button" aria-selected={on} onClick={() => setMobileCol(c)}
                  className={clsx('flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-3 text-sm font-medium transition active:scale-95', on ? clsx(tone.tile, tone.ring, tone.ink) : 'border-transparent bg-surface-2 text-muted')}>
                  <span className={clsx(on && 'gc-pop')} key={on ? 'on' : 'off'}>{COLUMN_STYLE[c].icon('size-5')}</span>{t(`col_${c}`)}<span className="text-xs opacity-80">{shown.filter((x) => x.column === c).length}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TASK_COLUMNS.map((c) => (
              <Column key={c} column={c} tasks={shown.filter((x) => x.column === c)} hiddenOnMobile={mobileCol !== c}
                onEdit={setEditing} onAdd={() => setCreating(c)} milestones={milestones} />
            ))}
          </div>
        </>
      )}
      {view === 'list' && <ListView tasks={shown} projects={projects} onEdit={setEditing} />}
      {view === 'timeline' && <Timeline tasks={shown} onEdit={setEditing} />}

      <TaskDialog open={!!editing} task={editing} projects={projects} milestones={milestones} onClose={closeEdit} />
      <TaskDialog open={!!creating} task={null} projects={projects} milestones={milestones} defaultColumn={creating ?? 'idea'} defaultProjectId={projectId} onClose={closeCreate} />
    </section>
  );
}

function Column({ column, tasks, hiddenOnMobile, onEdit, onAdd, milestones }: { column: TaskColumn; tasks: Task[]; hiddenOnMobile: boolean; onEdit: (t: Task) => void; onAdd: () => void; milestones: Milestone[] }) {
  const t = useTranslations('tasks');
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  const style = COLUMN_STYLE[column];
  const tone = TONE[style.tone];
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData('text/task'); if (id) start(async () => { await moveTaskAction(id, column); }); }}
      className={clsx('rounded-2xl p-2.5 transition-shadow', tone.tile, hiddenOnMobile && 'hidden md:block', over && 'ring-2 ring-brand')}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={clsx('flex size-9 items-center justify-center rounded-xl bg-surface/80 shadow-sm', tone.ink)}>{style.icon('size-6')}</span>
        <h3 className={clsx('font-semibold', tone.ink)}>{t(`col_${column}`)}</h3>
        <span className="ms-auto text-sm text-muted">{tasks.length}</span>
        <button type="button" onClick={onAdd} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label={t('newTask')}><Plus className="size-4" /></button>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && <p className="py-6 text-center text-xs text-muted">{t('empty')}</p>}
        {tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} draggable milestone={milestones.find((m) => m.id === task.milestoneId)} />)}
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
            <h3 className={clsx('mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold', TONE[COLUMN_STYLE[c].tone].ink)}>{COLUMN_STYLE[c].icon('size-5')}{t(`col_${c}`)} · {rows.length}</h3>
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
        {task.priority > 0 && <PriorityChip priority={task.priority} iconOnly />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">{task.title}</span>
        {task.blockedReason && task.column !== 'done' && <Ban className="size-4 text-danger" />}
        {project && <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex"><ProjectIcon icon={project.icon} color={project.color} size="xs" />{project.name}</span>}
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
