'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { X, Gauge, ListPlus, Bug, Flag, Ban, ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Ring } from '@/components/ui/Ring';
import { useShell } from '@/components/shell/ShellContext';
import { HealthBadge, SeverityBadge } from '@/components/command/badges';
import { ColumnChip, ProjectIcon, ProjectStatusChip } from '@/components/icons/options';
import { DecisionGlyph } from '@/components/icons/glyphs';
import { isOpenIssue, milestoneProgress, progress, projectHealth, timeElapsed, type HealthReason } from '@/lib/project-health';
import { daysFromToday, formatDate, formatNumber } from '@/lib/format';
import type { Issue, Message, Milestone, Project, Task } from '@/lib/data/types';

// The project beside its chat: how it is doing, what is moving now, open bugs, the next phase and the
// decisions taken in this chat, with one-tap actions. Live with the board.
export function ProjectDock({ project, tasks, issues, milestones, decisions, today, onClose, onNewTask, onNewBug, onJump }: {
  project: Project; tasks: Task[]; issues: Issue[]; milestones: Milestone[]; decisions: Message[]; today: string;
  onClose: () => void; onNewTask: () => void; onNewBug: () => void; onJump: (id: string) => void;
}) {
  const t = useTranslations('chatPage');
  const tm = useTranslations('command');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [mine, setMine] = useState(false);
  const n = (v: number) => formatNumber(locale, v);
  const pt = useMemo(() => tasks.filter((x) => x.projectId === project.id), [tasks, project.id]);
  const pi = useMemo(() => issues.filter((x) => x.projectId === project.id), [issues, project.id]);
  const pm = useMemo(() => milestones.filter((x) => x.projectId === project.id), [milestones, project.id]);
  const p = progress(pt);
  const elapsed = timeElapsed(project, today);
  const health = projectHealth(project, pt, pi, pm, today);
  const moving = pt.filter((x) => (x.column === 'in_progress' || x.column === 'review') && (!mine || x.assigneeId === user.id))
    .sort((a, b) => b.priority - a.priority || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const blocked = pt.filter((x) => x.column !== 'done' && x.blockedReason);
  const bugs = pi.filter(isOpenIssue).sort((a, b) => b.severity - a.severity).slice(0, 4);
  const next = pm.filter((m) => !m.done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0] ?? null;
  const nextP = next ? milestoneProgress(next.id, pt) : null;
  const team = profiles.filter((x) => project.memberIds.includes(x.id) || x.id === project.managerId);
  const reason = (r: HealthReason) => (r.key === 'pastDeadline' ? tm('reason.pastDeadline') : r.key === 'behindSchedule' ? tm('reason.behindSchedule', { pct: n(r.pct) }) : tm(`reason.${r.key}`, { n: n(r.n) }));
  const fmt = (d: string) => formatDate(locale, `${d}T12:00:00Z`, { day: 'numeric', month: 'short' });

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-3 border-b border-line p-3">
        <button type="button" onClick={onClose} className="icon-btn size-9 xl:hidden" aria-label={t('close')}><ChevronLeft className="size-5 rtl:rotate-180" /></button>
        <ProjectIcon icon={project.icon} color={project.color} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" dir="auto">{project.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1"><ProjectStatusChip status={project.status} /><HealthBadge health={health.health} /></div>
        </div>
        <button type="button" onClick={onClose} className="icon-btn size-9 max-xl:hidden" aria-label={t('close')}><X className="size-5" /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        {/* Work done (outer ring) against time passed (inner ring) */}
        <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-3">
          <Ring value={p.pct} inner={elapsed} size={84} label={tm('kpi.progress')}>
            <span className="text-lg font-bold">{n(p.pct)}<span className="text-xs">{locale === 'fa' ? '٪' : '%'}</span></span>
          </Ring>
          <div className="min-w-0 flex-1 space-y-1.5 text-xs">
            <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-brand" />{t('dock.work', { done: n(p.done), total: n(p.total) })}</div>
            {elapsed !== null && <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-accent" />{t('dock.time', { pct: n(Math.round(elapsed)) })}</div>}
            {project.dueDate && <div className={clsx('flex items-center gap-2', daysFromToday(project.dueDate) < 0 && project.status !== 'done' ? 'text-danger' : 'text-muted')}>
              <Flag className="size-3.5" />{tm('due')}: {fmt(project.dueDate)}</div>}
            {team.length > 0 && <div className="flex -space-x-1.5 pt-1 rtl:space-x-reverse">{team.map((x) => <span key={x.id} className="rounded-full ring-2 ring-surface-2" title={x.displayName}><Avatar profile={x} size="sm" /></span>)}</div>}
          </div>
        </div>
        {health.reasons.length > 0 && <div className="flex flex-wrap gap-1.5">{health.reasons.map((r) => <span key={r.key} className="chip bg-accent-soft text-[#b9531a] dark:text-accent">{reason(r)}</span>)}</div>}

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onNewTask} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-brand-soft text-xs font-semibold text-brand transition active:scale-95"><ListPlus className="size-5" />{t('dock.newTask')}</button>
          <button type="button" onClick={onNewBug} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-[#fde4e4] text-xs font-semibold text-[#c24141] transition active:scale-95 dark:bg-[#3d2121] dark:text-[#f2a0a0]"><Bug className="size-5" />{t('dock.newBug')}</button>
          <Link href={`/projects/${project.id}`} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 text-xs font-semibold transition active:scale-95"><Gauge className="size-5" />{t('dock.center')}</Link>
        </div>

        {next && nextP && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted uppercase">{t('dock.nextPhase')}</h3>
            <div className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2"><Flag className="size-4 text-accent" /><span className="min-w-0 flex-1 truncate font-medium" dir="auto">{next.title}</span>
                {next.dueDate && <span className={clsx('text-xs', next.dueDate < today ? 'text-danger' : 'text-muted')}>{fmt(next.dueDate)}</span>}</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${nextP.pct}%` }} /></span>
                {n(nextP.done)}/{n(nextP.total)}
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mb-1.5 flex items-center">
            <h3 className="flex-1 text-xs font-semibold text-muted uppercase">{t('dock.moving')}</h3>
            <button type="button" onClick={() => setMine((x) => !x)} aria-pressed={mine} className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', mine ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>{t('dock.mine')}</button>
          </div>
          {moving.length === 0 ? <p className="rounded-2xl bg-surface-2 py-4 text-center text-xs text-muted">{t('dock.nothingMoving')}</p> : (
            <ul className="space-y-1">
              {moving.slice(0, 8).map((x) => {
                const a = profiles.find((pp) => pp.id === x.assigneeId) ?? null;
                return (
                  <li key={x.id}>
                    <Link href={`/tasks?task=${x.id}`} className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-surface-2">
                      <ColumnChip column={x.column} iconOnly />
                      <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{x.title}</span>
                      {x.blockedReason && <Ban className="size-4 text-danger" />}
                      {a && <Avatar profile={a} size="sm" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {blocked.length > 0 && <p className="mt-1 flex items-center gap-1.5 px-2 text-xs text-danger"><Ban className="size-3.5" />{t('dock.blocked', { n: n(blocked.length) })}</p>}
        </section>

        {bugs.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted uppercase">{t('dock.bugs')}</h3>
            <ul className="space-y-1">
              {bugs.map((b) => (
                <li key={b.id}><Link href={`/projects/${project.id}?tab=issues`} className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-surface-2">
                  <SeverityBadge severity={b.severity} /><span className="min-w-0 flex-1 truncate text-sm" dir="auto">{b.title}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase"><DecisionGlyph className="size-4" />{t('dock.decisions')}</h3>
          {decisions.length === 0 ? <p className="rounded-2xl bg-surface-2 p-3 text-xs text-muted">{t('dock.noDecisions')}</p> : (
            <ul className="space-y-1.5">
              {decisions.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => onJump(d.id)} className="w-full rounded-xl border-s-[3px] border-[#d9a520] bg-[#fbf1d3]/60 px-3 py-2 text-start text-sm hover:bg-[#fbf1d3] dark:bg-[#3a3016]/60">
                    <span className="line-clamp-2" dir="auto">{d.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{profiles.find((x) => x.id === d.authorId)?.displayName} · {formatDate(locale, d.createdAt, { day: 'numeric', month: 'short' })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
