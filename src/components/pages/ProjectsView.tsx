'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, UserPlus, UserMinus, Bug, Lightbulb, CalendarClock, Gauge } from 'lucide-react';
import clsx from 'clsx';
import { Link } from '@/i18n/navigation';
import { HealthBadge } from '@/components/command/badges';
import { isOpenIssue, projectHealth } from '@/lib/project-health';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { saveProjectAction, deleteProjectAction, createRoleAction, volunteerRoleAction, deleteRoleAction } from '@/app/actions/projects';
import { formatDate, formatNumber } from '@/lib/format';
import { PROJECT_STATUSES, type Issue, type Milestone, type Project, type ProjectIdea, type ProjectRole, type Task } from '@/lib/data/types';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

export function ProjectsView({ projects, tasks, roles, issues, ideas, milestones, today }: {
  projects: Project[]; tasks: Task[]; roles: ProjectRole[]; issues: Issue[]; ideas: ProjectIdea[]; milestones: Milestone[]; today: string;
}) {
  const t = useTranslations('projects');
  const tm = useTranslations('command');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [roleFor, setRoleFor] = useState<string | null>(null);
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const [state, action, pending] = useActionState(saveProjectAction, null);
  const [roleState, roleAction, rolePending] = useActionState(createRoleAction, null);
  const status = useResultStatus(state);
  const roleStatus = useResultStatus(roleState);
  useEffect(() => { if (state?.ok) setEditing(null); }, [state]);
  useEffect(() => { if (roleState?.ok) setRoleFor(null); }, [roleState]);
  const project = editing && editing !== 'new' ? editing : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <button type="button" className="btn-primary ms-auto min-h-10" onClick={() => setEditing('new')}><Plus className="size-4" />{t('new')}</button>
      </div>
      {projects.length === 0 && <p className="card p-8 text-center text-sm text-muted">{t('empty')}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const pt = tasks.filter((x) => x.projectId === p.id);
          const done = pt.filter((x) => x.column === 'done').length;
          const manager = profiles.find((x) => x.id === p.managerId) ?? null;
          const canEdit = user.role === 'admin' || p.managerId === user.id;
          const pr = roles.filter((r) => r.projectId === p.id);
          const pi = issues.filter((x) => x.projectId === p.id);
          const { health } = projectHealth(p, pt, pi, milestones.filter((m) => m.projectId === p.id), today);
          const openBugs = pi.filter(isOpenIssue).length;
          const newIdeas = ideas.filter((x) => x.projectId === p.id && (x.status === 'new' || x.status === 'review')).length;
          return (
            <section key={p.id} id={p.id} className="card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="font-semibold hover:text-brand" dir="auto">{p.name}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={clsx('chip', p.status === 'active' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted')}>{tm(`status.${p.status}`)}</span>
                    <HealthBadge health={health} />
                  </div>
                  {p.description && <p className="mt-1 text-sm text-muted" dir="auto">{p.description}</p>}
                </div>
                {canEdit && <>
                  <button type="button" className="icon-btn" aria-label={tc('edit')} onClick={() => setEditing(p)}><Pencil className="size-4" /></button>
                  <button type="button" className="icon-btn text-muted hover:text-danger" aria-label={tc('delete')} onClick={() => { if (confirm(t('confirmDelete'))) run(() => deleteProjectAction(p.id)); }}><Trash2 className="size-4" /></button>
                </>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <span className="flex items-center gap-2"><Avatar profile={manager} size="sm" /><span className="text-muted">{t('manager')}:</span><span>{manager?.displayName ?? '—'}</span></span>
                <span className="flex items-center gap-1.5 text-muted"><CalendarClock className="size-4" />{p.dueDate ? formatDate(locale, `${p.dueDate}T12:00:00Z`) : tm('noDue')}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/projects/${p.id}?tab=issues`} className={clsx('chip min-h-8 gap-1', openBugs ? 'bg-accent-soft text-[#b9531a] dark:text-accent' : 'bg-surface-2 text-muted')}><Bug className="size-3.5" />{tm('kpi.openBugs')}: {formatNumber(locale, openBugs)}</Link>
                <Link href={`/projects/${p.id}?tab=ideas`} className="chip min-h-8 gap-1 bg-surface-2 text-muted"><Lightbulb className="size-3.5" />{tm('kpi.newIdeas')}: {formatNumber(locale, newIdeas)}</Link>
                <Link href={`/projects/${p.id}`} className="btn-primary ms-auto min-h-8 px-3 text-sm"><Gauge className="size-4" />{tm('open')}</Link>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs text-muted">{t('progress', { done: formatNumber(locale, done), total: formatNumber(locale, pt.length) })}</div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${pt.length ? (done / pt.length) * 100 : 0}%` }} /></div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center"><h3 className="text-sm font-semibold">{t('roles')}</h3>
                  <button type="button" className="ms-auto flex items-center gap-1 text-xs text-brand" onClick={() => setRoleFor(p.id)}><Plus className="size-3.5" />{t('newRole')}</button></div>
                <ul className="space-y-1.5">
                  {pr.map((r) => {
                    const v = profiles.find((x) => x.id === r.volunteerId) ?? null;
                    return (
                      <li key={r.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1"><div className="font-medium" dir="auto">{r.name}</div>{r.description && <div className="text-xs text-muted" dir="auto">{r.description}</div>}</div>
                        {v ? <span className="flex items-center gap-1.5 text-xs"><Avatar profile={v} size="sm" />{v.displayName}</span> : <span className="chip bg-accent-soft text-accent">{t('open')}</span>}
                        {!v && <button type="button" className="icon-btn text-brand" aria-label={t('volunteer')} onClick={() => run(() => volunteerRoleAction(r.id, true))}><UserPlus className="size-4" /></button>}
                        {v?.id === user.id && <button type="button" className="icon-btn text-muted" aria-label={t('withdraw')} onClick={() => run(() => volunteerRoleAction(r.id, false))}><UserMinus className="size-4" /></button>}
                        {canEdit && <button type="button" className="icon-btn text-muted hover:text-danger" aria-label={tc('delete')} onClick={() => run(() => deleteRoleAction(r.id))}><Trash2 className="size-4" /></button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={project ? tc('edit') : t('new')}>
        <form action={action} className="space-y-3" key={project?.id ?? 'new'}>
          {project && <input type="hidden" name="id" value={project.id} />}
          <div><label className="label">{t('name')}</label><input name="name" required defaultValue={project?.name} className="input" dir="auto" /></div>
          <div><label className="label">{t('description')}</label><textarea name="description" rows={3} defaultValue={project?.description} className="input py-2" dir="auto" /></div>
          <div><label className="label">{t('manager')}</label>
            <select name="managerId" defaultValue={project?.managerId ?? user.id} className="input">{profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">{tm('changeStatus')}</label>
              <select name="status" defaultValue={project?.status ?? 'active'} className="input">{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{tm(`status.${s}`)}</option>)}</select></div>
            <div><label className="label">{tm('due')}</label><input type="date" name="dueDate" defaultValue={project?.dueDate ?? ''} className="input" /></div>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEditing(null)}>{tc('cancel')}</button><SaveButton pending={pending} status={status}>{tc('save')}</SaveButton></div>
        </form>
      </Dialog>
      <Dialog open={!!roleFor} onClose={() => setRoleFor(null)} title={t('newRole')}>
        <form action={roleAction} className="space-y-3">
          <input type="hidden" name="projectId" value={roleFor ?? ''} />
          <div><label className="label">{t('roleName')}</label><input name="name" required className="input" dir="auto" /></div>
          <div><label className="label">{t('description')}</label><input name="description" className="input" dir="auto" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setRoleFor(null)}>{tc('cancel')}</button><SaveButton pending={rolePending} status={roleStatus}>{tc('save')}</SaveButton></div>
        </form>
      </Dialog>
    </div>
  );
}
