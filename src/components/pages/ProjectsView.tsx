'use client';
import { useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Bug, Lightbulb, Flag, MessageCircle, Gauge, LayoutGrid, UserPlus, Ban } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { HealthBadge } from '@/components/command/badges';
import { isOpenIssue, progress, projectHealth, projectStart, timeElapsed } from '@/lib/project-health';
import { Avatar } from '@/components/ui/Avatar';
import { Ring } from '@/components/ui/Ring';
import { useShell } from '@/components/shell/ShellContext';
import { deleteProjectAction } from '@/app/actions/projects';
import { formatDate, formatNumber } from '@/lib/format';
import { projectChannel } from '@/lib/chat';
import { PROJECT_STATUSES, type Issue, type Milestone, type Project, type ProjectIdea, type ProjectRole, type ProjectStatus, type Task } from '@/lib/data/types';
import { PROJECT_STATUS_STYLE, TONE, ProjectIcon, ProjectStatusChip, ProjectPriorityChip } from '@/components/icons/options';
import { DoneGlyph, ProgressGlyph } from '@/components/icons/glyphs';
import { ProjectDialog } from '@/components/projects/ProjectDialog';

type Filter = 'all' | ProjectStatus;

export function ProjectsView({ projects, tasks, roles, issues, ideas, milestones, today }: {
  projects: Project[]; tasks: Task[]; roles: ProjectRole[]; issues: Issue[]; ideas: ProjectIdea[]; milestones: Milestone[]; today: string;
}) {
  const t = useTranslations('projects');
  const tm = useTranslations('command');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [, start] = useTransition();
  const n = (v: number) => formatNumber(locale, v);
  const fmt = (d: string) => formatDate(locale, `${d}T12:00:00Z`, { day: 'numeric', month: 'short' });

  const order: Record<ProjectStatus, number> = { active: 0, planning: 1, paused: 2, done: 3 };
  const shown = useMemo(() => projects.filter((p) => filter === 'all' || p.status === filter)
    .sort((a, b) => order[a.status] - order[b.status] || b.priority - a.priority || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [projects, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f: Filter) => (f === 'all' ? projects.length : projects.filter((p) => p.status === f).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <button type="button" className="btn-primary ms-auto min-h-10" onClick={() => setEditing('new')}><Plus className="size-4" />{t('new')}</button>
      </div>

      {/* Status filter as icon pills */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist">
        {(['all', ...PROJECT_STATUSES] as Filter[]).map((f) => {
          const on = filter === f;
          const style = f === 'all' ? null : PROJECT_STATUS_STYLE[f];
          const tone = style ? TONE[style.tone] : TONE.brand;
          return (
            <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)}
              className={clsx('flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border-2 px-3 text-sm font-medium transition active:scale-95',
                on ? clsx(tone.tile, tone.ring, tone.ink) : 'border-transparent bg-surface text-muted hover:text-ink')}>
              {style ? style.icon('size-5') : <LayoutGrid className="size-5" />}
              {f === 'all' ? t('all') : tm(`status.${f}`)}
              <span className={clsx('rounded-full px-1.5 text-xs', on ? 'bg-white/60 dark:bg-black/20' : 'bg-surface-2')}>{n(count(f))}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <ProjectIcon icon="rocket" color="green" size="lg" />
          <p className="text-sm text-muted">{projects.length ? t('noneHere') : t('empty')}</p>
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus className="size-4" />{t('new')}</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {shown.map((p) => {
          const pt = tasks.filter((x) => x.projectId === p.id);
          const pi = issues.filter((x) => x.projectId === p.id);
          const pm = milestones.filter((x) => x.projectId === p.id);
          const pr = progress(pt);
          const elapsed = timeElapsed(p, today);
          const { health } = projectHealth(p, pt, pi, pm, today);
          const manager = profiles.find((x) => x.id === p.managerId) ?? null;
          const team = profiles.filter((x) => p.memberIds.includes(x.id) && x.id !== p.managerId);
          const canEdit = user.role === 'admin' || p.managerId === user.id;
          const openBugs = pi.filter(isOpenIssue).length;
          const newIdeas = ideas.filter((x) => x.projectId === p.id && (x.status === 'new' || x.status === 'review')).length;
          const doing = pt.filter((x) => x.column === 'in_progress' || x.column === 'review').length;
          const blocked = pt.filter((x) => x.column !== 'done' && x.blockedReason).length;
          const openRoles = roles.filter((r) => r.projectId === p.id && !r.volunteerId).length;
          const nextMs = pm.filter((m) => !m.done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0];
          const stat = (href: string, icon: React.ReactNode, value: number, label: string, warn = false) => (
            <Link href={href} className={clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-2 px-1 text-center transition hover:bg-brand-soft active:scale-95', warn && value > 0 && 'bg-accent-soft text-[#b9531a] dark:text-accent')}>
              <span className="flex items-center gap-1 text-base font-semibold">{icon}{n(value)}</span>
              <span className="w-full truncate text-[10px] text-muted">{label}</span>
            </Link>
          );
          return (
            <section key={p.id} id={p.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <ProjectIcon icon={p.icon} color={p.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="block truncate text-lg font-semibold hover:text-brand" dir="auto">{p.name}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5"><ProjectStatusChip status={p.status} /><ProjectPriorityChip priority={p.priority} /><HealthBadge health={health} /></div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0">
                    <button type="button" className="icon-btn size-9" aria-label={tc('edit')} onClick={() => setEditing(p)}><Pencil className="size-4" /></button>
                    <button type="button" className="icon-btn size-9 text-muted hover:text-danger" aria-label={tc('delete')}
                      onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteProjectAction(p.id); }); }}><Trash2 className="size-4" /></button>
                  </div>
                )}
              </div>
              {(p.goal || p.description) && <p className="line-clamp-2 text-sm text-muted" dir="auto">{p.goal ? <>🎯 {p.goal}</> : p.description}</p>}

              <div className="flex items-center gap-4">
                <Ring value={pr.pct} inner={elapsed} size={76} label={tm('kpi.progress')}>
                  <span className="text-base font-bold">{n(pr.pct)}<span className="text-[10px]">{locale === 'fa' ? '٪' : '%'}</span></span>
                </Ring>
                <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
                  {stat(`/projects/${p.id}?tab=tasks`, <DoneGlyph className="size-4 text-brand" />, pr.done, t('statDone'))}
                  {stat(`/projects/${p.id}?tab=tasks`, <ProgressGlyph className="size-4 text-[#3567c4] dark:text-[#8fb3f2]" />, doing, t('statDoing'))}
                  {stat(`/projects/${p.id}?tab=issues`, <Bug className="size-4" />, openBugs, tm('kpi.openBugs'), true)}
                  {stat(`/projects/${p.id}?tab=ideas`, <Lightbulb className="size-4 text-[#a26a00] dark:text-[#f0c766]" />, newIdeas, t('statIdeas'))}
                </div>
              </div>

              {/* From start to deadline, with today */}
              {p.dueDate && (
                <div>
                  <div className="relative h-2 rounded-full bg-surface-2">
                    <div className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-accent/60 to-accent rtl:bg-gradient-to-l" style={{ width: `${elapsed ?? 0}%` }} />
                    <div className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-brand rtl:translate-x-1/2" style={{ insetInlineStart: `${pr.pct}%` }} title={tm('kpi.progress')} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{fmt(projectStart(p))}</span>
                    {nextMs && <span className="flex items-center gap-1 truncate px-2"><Flag className="size-3 text-accent" /><span className="truncate" dir="auto">{nextMs.title}</span></span>}
                    <span className={clsx(p.dueDate < today && p.status !== 'done' && 'font-semibold text-danger')}>{fmt(p.dueDate)}</span></div>
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="flex items-center -space-x-1.5 rtl:space-x-reverse" title={t('team')}>
                  {manager && <span className="relative rounded-full ring-2 ring-accent" title={`${t('manager')}: ${manager.displayName}`}><Avatar profile={manager} size="sm" /></span>}
                  {team.slice(0, 4).map((x) => <span key={x.id} className="rounded-full ring-2 ring-surface" title={x.displayName}><Avatar profile={x} size="sm" /></span>)}
                </span>
                {openRoles > 0 && <Link href={`/projects/${p.id}?tab=team`} className="chip min-h-7 gap-1 bg-accent-soft text-[#b9531a] dark:text-accent"><UserPlus className="size-3.5" />{t('openRoles', { n: n(openRoles) })}</Link>}
                {blocked > 0 && <span className="chip min-h-7 gap-1 bg-danger/10 text-danger"><Ban className="size-3.5" />{n(blocked)}</span>}
                <span className="ms-auto flex gap-1.5">
                  <Link href={`/chat?c=${encodeURIComponent(projectChannel(p.id))}`} className="btn-ghost min-h-9 px-3 text-sm" aria-label={t('discuss')}><MessageCircle className="size-4" /><span className="max-sm:hidden">{t('discuss')}</span></Link>
                  <Link href={`/projects/${p.id}`} className="btn-primary min-h-9 px-3 text-sm"><Gauge className="size-4" />{tm('open')}</Link>
                </span>
              </div>
            </section>
          );
        })}
      </div>
      <ProjectDialog open={!!editing} project={editing && editing !== 'new' ? editing : null} onClose={() => setEditing(null)} />
    </div>
  );
}
