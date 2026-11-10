'use client';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, Bug, CalendarClock, CheckCircle2, ClipboardList, HeartHandshake, TimerReset } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { TrendChart, StackBar, MiniBar } from '@/components/command/Charts';
import { HealthBadge } from '@/components/command/badges';
import { activityTrend, isOpenIssue, progress, projectHealth, workload } from '@/lib/project-health';
import { kudosBoard, standupStreak } from '@/lib/pulse';
import { meetingSeconds } from '@/lib/meetings';
import { formatNumber } from '@/lib/format';
import { addDays } from '@/lib/todos';
import type { Issue, Meeting, MeetingAttendance, Milestone, Post, Project, Task } from '@/lib/data/types';

const COLUMNS = ['idea', 'in_progress', 'review', 'done'] as const;

/**
 * Team insights on one page: this week's numbers, the trend of finished tasks and fixed bugs, where the
 * work sits, every project's health, and each member's load, finished work, kudos and standup streak.
 */
export function InsightsView({ tasks, projects, issues, milestones, meetings, attendance, posts, today }: {
  tasks: Task[]; projects: Project[]; issues: Issue[]; milestones: Milestone[]; meetings: Meeting[]; attendance: MeetingAttendance[]; posts: Post[]; today: string;
}) {
  const t = useTranslations('insights');
  const tt = useTranslations('tasks');
  const tc = useTranslations('command');
  const locale = useLocale();
  const { profiles } = useShell();
  const n = (v: number) => formatNumber(locale, v);
  const weekAgo = addDays(today, -6), monthAgo = addDays(today, -29);
  const open = tasks.filter((x) => x.column !== 'done');
  const doneThisWeek = tasks.filter((x) => x.column === 'done' && x.updatedAt.slice(0, 10) >= weekAgo);
  const overdue = open.filter((x) => x.dueDate && x.dueDate < today);
  const openBugs = issues.filter(isOpenIssue);
  const recentMeetings = meetings.filter((m) => m.startedAt.slice(0, 10) >= monthAgo);
  const meetingHours = recentMeetings.reduce((sum, m) => sum + meetingSeconds(m, attendance, Date.now()), 0) / 3600;
  const kudosMonth = posts.filter((p) => p.kind === 'kudos' && p.createdAt.slice(0, 10) >= monthAgo).length;
  const trend = activityTrend(tasks, issues, today, 28);
  const load = workload(profiles.map((p) => p.id), tasks, issues);
  const maxLoad = Math.max(1, ...load.map((l) => Math.max(l.tasks, l.bugs)));
  const kudos = kudosBoard(posts, profiles.map((p) => p.id));
  const tiles = [
    { icon: ClipboardList, label: t('openTasks'), value: n(open.length), tone: 'text-[var(--viz-tasks)]' },
    { icon: CheckCircle2, label: t('doneWeek'), value: n(doneThisWeek.length), tone: 'text-brand' },
    { icon: TimerReset, label: t('overdue'), value: n(overdue.length), tone: overdue.length ? 'text-danger' : 'text-muted' },
    { icon: Bug, label: t('openBugs'), value: n(openBugs.length), tone: openBugs.length ? 'text-[var(--viz-bugs)]' : 'text-muted' },
    { icon: CalendarClock, label: t('meetingHours'), value: formatNumber(locale, meetingHours, 1), tone: 'text-accent' },
    { icon: HeartHandshake, label: t('kudosMonth'), value: n(kudosMonth), tone: 'text-accent' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><BarChart3 className="size-5 text-accent" />{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((x) => (
          <li key={x.label} className="card p-4">
            <x.icon className={clsx('size-5', x.tone)} />
            <div className="mt-2 text-2xl font-semibold tabular-nums">{x.value}</div>
            <div className="text-xs text-muted">{x.label}</div>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('trend')}</h2>
          <TrendChart locale={locale} days={trend.days} series={[
            { label: tc('trendTasks'), color: 'var(--viz-tasks)', values: trend.done },
            { label: tc('trendFixed'), color: 'var(--viz-bugs)', values: trend.fixed },
          ]} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('whereWork')}</h2>
          <StackBar locale={locale} parts={COLUMNS.map((c, i) => ({ label: tt(`col_${c}`), color: `var(--viz-s${i})`, value: tasks.filter((x) => x.column === c).length }))} />
          <h3 className="mt-5 mb-2 text-sm font-semibold">{t('projects')}</h3>
          <ul className="space-y-3">
            {projects.map((p) => {
              const own = tasks.filter((x) => x.projectId === p.id);
              const pr = progress(own);
              const { health } = projectHealth(p, own, issues.filter((i) => i.projectId === p.id), milestones.filter((m) => m.projectId === p.id), today);
              return (
                <li key={p.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline" dir="auto">{p.name}</Link>
                    <HealthBadge health={health} />
                    <span className="w-10 text-end text-xs tabular-nums text-muted">{n(pr.pct)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${pr.pct}%` }} /></div>
                </li>
              );
            })}
            {projects.length === 0 && <li className="text-sm text-muted">{t('noProjects')}</li>}
          </ul>
        </section>
      </div>
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">{t('people')}</h2>
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--viz-tasks)' }} />{tc('wlTasks')}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--viz-bugs)' }} />{tc('wlBugs')}</span>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => {
            const l = load.find((x) => x.id === p.id)!;
            const done = tasks.filter((x) => x.assigneeId === p.id && x.column === 'done' && x.updatedAt.slice(0, 10) >= monthAgo).length;
            const k = kudos.find((x) => x.id === p.id)!;
            const streak = standupStreak(posts, p.id, today);
            return (
              <li key={p.id} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center gap-3">
                  <Avatar profile={p} />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.displayName}</div><div className="truncate text-xs text-muted">{p.jobTitle}</div></div>
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2"><MiniBar value={l.tasks} max={maxLoad} color="var(--viz-tasks)" /><span className="w-5 text-end tabular-nums">{n(l.tasks)}</span></div>
                  <div className="flex items-center gap-2"><MiniBar value={l.bugs} max={maxLoad} color="var(--viz-bugs)" /><span className="w-5 text-end tabular-nums">{n(l.bugs)}</span></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="chip bg-brand-soft text-brand">✓ {t('doneMonth', { n: n(done) })}</span>
                  <span className="chip bg-accent-soft text-accent">🙏 {t('kudosGot', { n: n(k.received) })}</span>
                  {streak > 0 && <span className="chip bg-surface text-ink">🔥 {t('streak', { n: n(streak) })}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
