'use client';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Bug, CalendarClock, ClipboardCopy, Flag, LayoutDashboard, Lightbulb, ListTodo, Map as MapIcon, AlertTriangle, CheckCircle2, NotebookPen, Users, MessageCircle, Pencil, Target, KanbanSquare } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { formatDate, formatNumber } from '@/lib/format';
import { activityTrend, isOpenIssue, needsAttention, progress, projectHealth, projectStart, timeElapsed, workload, type HealthReason } from '@/lib/project-health';
import type { Issue, IssueComment, Meeting, Message, Milestone, Project, ProjectIdea, ProjectRole, SharedNote, Task } from '@/lib/data/types';
import { TaskViews } from '@/components/tasks/TaskViews';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { Ring } from '@/components/ui/Ring';
import { ProjectIcon, ProjectStatusChip, ProjectPriorityChip } from '@/components/icons/options';
import { DecisionGlyph } from '@/components/icons/glyphs';
import { projectChannel } from '@/lib/chat';
import { TeamPanel } from './TeamPanel';
import { DecisionsPanel } from './DecisionsPanel';
import { ProjectNotes } from '@/components/meetings/ProjectNotes';
import { HealthBadge, SeverityBadge } from './badges';
import { TrendChart, StackBar, MiniBar } from './Charts';
import { IssuesPanel } from './IssuesPanel';
import { IdeasPanel } from './IdeasPanel';
import { Roadmap } from './Roadmap';
import { ReportIssueDialog } from './ReportIssue';

const TABS = ['overview', 'tasks', 'roadmap', 'issues', 'ideas', 'team', 'decisions', 'notes'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { overview: LayoutDashboard, tasks: KanbanSquare, issues: Bug, ideas: Lightbulb, roadmap: MapIcon, team: Users, decisions: DecisionGlyph, notes: NotebookPen };

export interface CommandData {
  project: Project; projects: Project[]; tasks: Task[]; issues: Issue[]; comments: IssueComment[]; ideas: ProjectIdea[]; milestones: Milestone[];
  sharedNotes: SharedNote[]; meetings: Meeting[]; roles: ProjectRole[]; decisions: Message[]; today: string; tab?: string;
}

export function CommandCenter({ project, projects, tasks, issues, comments, ideas, milestones, sharedNotes, meetings, roles, decisions, today, tab: initialTab }: CommandData) {
  const t = useTranslations('command');
  const tt = useTranslations('tasks');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [tab, setTabState] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'overview');
  const [reporting, setReporting] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const tp = useTranslations('projects');
  const team = profiles.filter((p) => project.memberIds.includes(p.id) && p.id !== project.managerId);
  const elapsed = timeElapsed(project, today);
  const chatHref = `/chat?c=${encodeURIComponent(projectChannel(project.id))}`;
  const canManage = user.role === 'admin' || project.managerId === user.id;
  const manager = profiles.find((p) => p.id === project.managerId) ?? null;
  const n = (v: number) => formatNumber(locale, v);
  const fmtDay = (d: string) => formatDate(locale, `${d}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' });

  // Tab lives in the URL (?tab=) so a link or a refresh lands on the same view.
  const setTab = (next: Tab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };

  const stats = useMemo(() => {
    const p = progress(tasks);
    const open = issues.filter(isOpenIssue);
    return {
      p, open, high: open.filter((i) => i.severity >= 2).length,
      health: projectHealth(project, tasks, issues, milestones, today),
      attention: needsAttention(tasks, issues, milestones, today),
      trend: activityTrend(tasks, issues, today),
      load: workload(profiles.map((x) => x.id), tasks, issues),
      newIdeas: ideas.filter((i) => i.status === 'new' || i.status === 'review').length,
      next: milestones.filter((m) => !m.done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0] ?? null,
    };
  }, [project, tasks, issues, milestones, ideas, profiles, today]);

  const closeEdit = useCallback(() => setEditing(false), []);
  const reason = (r: HealthReason) => (r.key === 'pastDeadline' ? t('reason.pastDeadline') : r.key === 'behindSchedule' ? t('reason.behindSchedule', { pct: n(r.pct) }) : t(`reason.${r.key}`, { n: n(r.n) }));

  const copyReport = async () => {
    const lines = [
      `📊 ${project.name} — ${t(`status.${project.status}`)} · ${t(`health.${stats.health.health}`)}`,
      `${t('kpi.progress')}: ${n(stats.p.pct)}% (${t('kpi.of', { done: n(stats.p.done), total: n(stats.p.total) })})`,
      `${t('kpi.openBugs')}: ${n(stats.open.length)} · ${t('kpi.highBugs', { n: n(stats.high) })}`,
      ...(project.dueDate ? [`${t('due')}: ${fmtDay(project.dueDate)}`] : []),
      ...(stats.next ? [`${t('milestones')}: ${stats.next.title}${stats.next.dueDate ? ` (${fmtDay(stats.next.dueDate)})` : ''}`] : []),
      ...stats.health.reasons.map((r) => `• ${reason(r)}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const tabCount: Record<Tab, number | null> = {
    overview: null, tasks: tasks.filter((x) => x.column !== 'done').length, issues: stats.open.length, ideas: stats.newIdeas, roadmap: milestones.filter((m) => !m.done).length,
    team: roles.filter((r) => !r.volunteerId).length || null, decisions: decisions.length, notes: sharedNotes.length,
  };
  const columns = ['idea', 'in_progress', 'review', 'done'] as const;
  const maxLoad = Math.max(1, ...stats.load.flatMap((l) => [l.tasks, l.bugs]));

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link href="/projects" className="inline-flex min-h-8 items-center gap-1 text-sm text-muted hover:text-ink"><ArrowRight className="size-4 ltr:rotate-180" />{t('back')}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <ProjectIcon icon={project.icon} color={project.color} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold sm:text-2xl" dir="auto">{project.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5"><ProjectStatusChip status={project.status} /><ProjectPriorityChip priority={project.priority} /><HealthBadge health={stats.health.health} /></div>
          </div>
          <div className="flex gap-2">
            <Link href={chatHref} className="btn-primary min-h-10"><MessageCircle className="size-4" />{tp('discuss')}</Link>
            {canManage && <button type="button" className="btn-ghost min-h-10 px-3" onClick={() => setEditing(true)} aria-label={tp('edit')}><Pencil className="size-4" /><span className="max-sm:hidden">{tp('edit')}</span></button>}
          </div>
        </div>
      </header>

      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map((k) => {
          const Icon = TAB_ICON[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx('flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium', tab === k ? 'bg-brand text-brand-ink' : 'bg-surface text-muted hover:text-ink')}>
              <Icon className="size-4" />{t(`tabs.${k}`)}
              {!!tabCount[k] && <span className={clsx('rounded-full px-1.5 text-xs', tab === k ? 'bg-white/25' : 'bg-surface-2')}>{n(tabCount[k]!)}</span>}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Project brief: the goal, from start to deadline, who leads it and who is on it */}
          <section className="card grid gap-4 p-3 sm:p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
            <Ring value={stats.p.pct} inner={elapsed} size={96} label={t('kpi.progress')}>
              <span className="text-xl font-bold">{n(stats.p.pct)}<span className="text-xs">{locale === 'fa' ? '٪' : '%'}</span></span>
            </Ring>
            <div className="min-w-0 space-y-2">
              <p className="flex items-start gap-2 text-sm" dir="auto"><Target className="mt-0.5 size-4 shrink-0 text-accent" />
                {project.goal || <span className="text-muted">{tp('noGoal')}</span>}</p>
              {project.description && <p className="text-sm text-muted" dir="auto">{project.description}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" />{tp('briefWork', { pct: n(stats.p.pct) })}</span>
                {elapsed !== null && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" />{tp('briefTime', { pct: n(Math.round(elapsed)) })}</span>}
                <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />{fmtDay(projectStart(project))} → {project.dueDate ? fmtDay(project.dueDate) : t('noDue')}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 md:flex-col md:items-end">
              <span className="flex items-center gap-1.5 text-sm"><Avatar profile={manager} size="sm" /><span className="text-muted">{t('manager')}:</span>{manager?.displayName ?? '—'}</span>
              {team.length > 0 && <span className="flex -space-x-1.5 rtl:space-x-reverse">{team.map((p) => <span key={p.id} title={p.displayName} className="rounded-full ring-2 ring-surface"><Avatar profile={p} size="sm" /></span>)}</span>}
            </div>
          </section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-3 sm:p-4">
              <div className="text-xs text-muted">{t('kpi.progress')}</div>
              <div className="mt-1 text-2xl font-semibold sm:text-3xl">{n(stats.p.pct)}{locale === 'fa' ? '٪' : '%'}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${stats.p.pct}%` }} /></div>
              <div className="mt-1.5 text-xs text-muted">{t('kpi.of', { done: n(stats.p.done), total: n(stats.p.total) })}</div>
            </div>
            <button type="button" onClick={() => setTab('issues')} className="card p-3 text-start hover:ring-2 hover:ring-brand/40 sm:p-4">
              <div className="flex items-center gap-1 text-xs text-muted"><Bug className="size-3.5" />{t('kpi.openBugs')}</div>
              <div className="mt-1 text-2xl font-semibold sm:text-3xl">{n(stats.open.length)}</div>
              <div className={clsx('mt-2 text-xs', stats.high ? 'font-medium text-danger' : 'text-muted')}>{stats.high ? t('kpi.highBugs', { n: n(stats.high) }) : t('kpi.noHigh')}</div>
            </button>
            <button type="button" onClick={() => setTab('ideas')} className="card p-3 text-start hover:ring-2 hover:ring-brand/40 sm:p-4">
              <div className="flex items-center gap-1 text-xs text-muted"><Lightbulb className="size-3.5" />{t('kpi.newIdeas')}</div>
              <div className="mt-1 text-2xl font-semibold sm:text-3xl">{n(stats.newIdeas)}</div>
              <div className="mt-2 text-xs text-muted">{t('kpi.ideasTotal', { n: n(ideas.length) })}</div>
            </button>
            <button type="button" onClick={() => setTab('roadmap')} className="card p-3 text-start hover:ring-2 hover:ring-brand/40 sm:p-4">
              <div className="flex items-center gap-1 text-xs text-muted"><Flag className="size-3.5" />{t('milestones')}</div>
              {stats.next ? <>
                <div className="mt-1 truncate text-base font-semibold sm:text-lg" dir="auto">{stats.next.title}</div>
                <div className={clsx('mt-2 text-xs', stats.next.dueDate && stats.next.dueDate < today ? 'font-medium text-danger' : 'text-muted')}>{stats.next.dueDate ? fmtDay(stats.next.dueDate) : t('noDue')}</div>
              </> : <div className="mt-2 text-sm text-muted">{t('milestonesEmpty')}</div>}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-3 sm:p-4 lg:col-span-2">
              <h2 className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-accent" />{t('attention')}</h2>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {stats.health.reasons.length === 0
                  ? <span className="chip gap-1 bg-brand-soft text-brand"><CheckCircle2 className="size-3.5" />{t('reason.none')}</span>
                  : stats.health.reasons.map((r) => <span key={r.key} className="chip bg-surface-2">{reason(r)}</span>)}
              </div>
              {stats.attention.length === 0 ? <p className="py-4 text-center text-sm text-muted">{t('attentionEmpty')}</p> : (
                <ul className="divide-y divide-line">
                  {stats.attention.map((a) => (
                    <li key={`${a.kind}-${a.id}`}>
                      {a.kind === 'issue' ? (
                        <button type="button" className="flex w-full items-center gap-2 py-2 text-start text-sm" onClick={() => { setTab('issues'); setOpenIssue(a.id); }}>
                          <SeverityBadge severity={a.severity as 0} /><span className="min-w-0 flex-1 truncate" dir="auto">{a.title}</span>
                        </button>
                      ) : a.kind === 'task' ? (
                        <Link href={`/tasks?task=${a.id}`} className="flex items-center gap-2 py-2 text-sm">
                          <span className="chip gap-1 bg-surface-2"><ListTodo className="size-3.5" />{t('kindTask')}</span>
                          <span className="min-w-0 flex-1 truncate" dir="auto">{a.title}</span><span className="text-xs text-danger">{t('overdueSince', { date: fmtDay(a.dueDate) })}</span>
                        </Link>
                      ) : (
                        <button type="button" className="flex w-full items-center gap-2 py-2 text-start text-sm" onClick={() => setTab('roadmap')}>
                          <span className="chip gap-1 bg-surface-2"><Flag className="size-3.5" />{t('kindMilestone')}</span>
                          <span className="min-w-0 flex-1 truncate" dir="auto">{a.title}</span><span className="text-xs text-danger">{t('overdueSince', { date: fmtDay(a.dueDate) })}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card p-3 sm:p-4">
              <h2 className="mb-3 font-semibold">{t('quick')}</h2>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <button type="button" className="btn-primary justify-start" onClick={() => setReporting(true)}><Bug className="size-4" />{t('reportBug')}</button>
                <button type="button" className="btn-ghost justify-start border border-line" onClick={() => setTab('ideas')}><Lightbulb className="size-4" />{t('addIdea')}</button>
                <button type="button" onClick={() => setTab('tasks')} className="btn-ghost justify-start border border-line"><ListTodo className="size-4" />{t('projectTasks')}</button>
                <button type="button" className="btn-ghost justify-start border border-line" onClick={copyReport}><ClipboardCopy className="size-4" />{copied ? t('copied') : t('progressReport')}</button>
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-3 sm:p-4 min-w-0 lg:col-span-2">
              <h2 className="mb-2 font-semibold">{t('trend')}</h2>
              <TrendChart locale={locale} days={stats.trend.days} series={[
                { label: t('trendTasks'), color: 'var(--viz-tasks)', values: stats.trend.done },
                { label: t('trendFixed'), color: 'var(--viz-bugs)', values: stats.trend.fixed },
              ]} />
            </section>
            <section className="card p-3 sm:p-4">
              <h2 className="mb-3 font-semibold">{t('taskStatus')}</h2>
              {tasks.length === 0 ? <p className="py-4 text-center text-sm text-muted">{t('noTasks')}</p> : (
                <StackBar locale={locale} parts={columns.map((c, i) => ({ label: tt(`col_${c}`), color: `var(--viz-s${i})`, value: tasks.filter((x) => x.column === c).length }))} />
              )}
              <h2 className="mb-2 mt-5 font-semibold">{t('workload')}</h2>
              <div className="mb-2 flex gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--viz-tasks)' }} />{t('wlTasks')}</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--viz-bugs)' }} />{t('wlBugs')}</span>
              </div>
              <ul className="space-y-2.5">
                {stats.load.map((l) => {
                  const p = profiles.find((x) => x.id === l.id) ?? null;
                  return (
                    <li key={l.id} className="flex items-center gap-2 text-xs">
                      <Avatar profile={p} size="sm" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="truncate font-medium">{p?.displayName}</div>
                        <div className="flex items-center gap-2"><MiniBar value={l.tasks} max={maxLoad} color="var(--viz-tasks)" /><span className="w-4 text-end">{n(l.tasks)}</span></div>
                        <div className="flex items-center gap-2"><MiniBar value={l.bugs} max={maxLoad} color="var(--viz-bugs)" /><span className="w-4 text-end">{n(l.bugs)}</span></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      )}

      {tab === 'tasks' && <TaskViews tasks={tasks} projects={projects} milestones={milestones} projectId={project.id} />}
      {tab === 'team' && <TeamPanel project={project} tasks={tasks} issues={issues} roles={roles} canManage={canManage} />}
      {tab === 'decisions' && <DecisionsPanel project={project} decisions={decisions} />}
      {tab === 'issues' && <IssuesPanel issues={issues} comments={comments} canManage={canManage} onReport={() => setReporting(true)} openId={openIssue} setOpenId={setOpenIssue} />}
      {tab === 'ideas' && <IdeasPanel projectId={project.id} ideas={ideas} canManage={canManage} />}
      {tab === 'notes' && <ProjectNotes notes={sharedNotes} meetings={meetings} />}
      {tab === 'roadmap' && <Roadmap project={project} tasks={tasks} milestones={milestones} canManage={canManage} today={today} />}

      <ProjectDialog open={editing} project={project} onClose={closeEdit} />
      <ReportIssueDialog open={reporting} onClose={() => setReporting(false)} projectId={project.id} />
    </div>
  );
}
