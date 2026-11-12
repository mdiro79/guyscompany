'use client';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Crown, Plus, Trash2, UserPlus, UserMinus, Ban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { MiniBar } from './Charts';
import { useShell } from '@/components/shell/ShellContext';
import { createRoleAction, volunteerRoleAction, deleteRoleAction } from '@/app/actions/projects';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';
import { isOpenIssue } from '@/lib/project-health';
import { formatNumber } from '@/lib/format';
import type { Issue, Project, ProjectRole, Task } from '@/lib/data/types';
import { COLUMN_STYLE } from '@/components/icons/options';

// Who works on the project: the manager and the team with what each one carries now (tasks per stage,
// open bugs, blocked work), and the roles that still need a volunteer.
export function TeamPanel({ project, tasks, issues, roles, canManage }: { project: Project; tasks: Task[]; issues: Issue[]; roles: ProjectRole[]; canManage: boolean }) {
  const t = useTranslations('projects');
  const tt = useTranslations('tasks');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(createRoleAction, null);
  const status = useResultStatus(state);
  const handled = useRef(state);
  useEffect(() => { if (state?.ok && handled.current !== state) { handled.current = state; setAdding(false); } }, [state]);
  const n = (v: number) => formatNumber(locale, v);
  // The team, plus anyone who has work in the project without being listed.
  const ids = new Set([project.managerId, ...project.memberIds, ...tasks.map((x) => x.assigneeId), ...issues.filter(isOpenIssue).map((i) => i.assigneeId)].filter((x): x is string => !!x));
  const people = profiles.filter((p) => ids.has(p.id)).sort((a, b) => Number(b.id === project.managerId) - Number(a.id === project.managerId));
  const max = Math.max(1, ...people.map((p) => tasks.filter((x) => x.assigneeId === p.id && x.column !== 'done').length));
  const free = tasks.filter((x) => !x.assigneeId && x.column !== 'done');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="card p-3 sm:p-4 lg:col-span-2">
        <h2 className="mb-3 font-semibold">{t('team')}</h2>
        <ul className="space-y-2">
          {people.map((p) => {
            const mine = tasks.filter((x) => x.assigneeId === p.id);
            const open = mine.filter((x) => x.column !== 'done');
            const bugs = issues.filter((i) => i.assigneeId === p.id && isOpenIssue(i)).length;
            const blocked = open.filter((x) => x.blockedReason).length;
            const listed = p.id === project.managerId || project.memberIds.includes(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <Avatar profile={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium">{p.displayName}
                    {p.id === project.managerId && <span className="chip gap-1 bg-accent-soft text-[#b9531a] dark:text-accent"><Crown className="size-3" />{t('manager')}</span>}
                    {!listed && <span className="chip bg-surface text-muted">{t('helping')}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2"><MiniBar value={open.length} max={max} color="var(--viz-tasks)" /><span className="text-xs text-muted">{t('openTasks', { n: n(open.length) })}</span></div>
                </div>
                <div className="flex gap-1">
                  {(['idea', 'in_progress', 'review', 'done'] as const).map((c) => (
                    <span key={c} className="flex min-w-11 flex-col items-center rounded-xl bg-surface px-1.5 py-1 text-xs" title={tt(`col_${c}`)}>
                      {COLUMN_STYLE[c].icon('size-4 text-muted')}<span className="font-semibold">{n(mine.filter((x) => x.column === c).length)}</span>
                    </span>
                  ))}
                  {bugs > 0 && <span className="flex min-w-11 flex-col items-center rounded-xl bg-accent-soft px-1.5 py-1 text-xs text-[#b9531a] dark:text-accent">🐞<span className="font-semibold">{n(bugs)}</span></span>}
                  {blocked > 0 && <span className="flex min-w-11 flex-col items-center rounded-xl bg-danger/10 px-1.5 py-1 text-xs text-danger"><Ban className="size-4" /><span className="font-semibold">{n(blocked)}</span></span>}
                </div>
              </li>
            );
          })}
        </ul>
        {free.length > 0 && <p className="mt-3 text-sm text-muted">{t('unassignedWork', { n: n(free.length) })}</p>}
      </section>

      <section className="card p-3 sm:p-4">
        <div className="mb-3 flex items-center"><h2 className="flex-1 font-semibold">{t('roles')}</h2>
          {canManage && <button type="button" className="btn-ghost min-h-9 px-3 text-sm" onClick={() => setAdding((x) => !x)}><Plus className="size-4" />{t('newRole')}</button>}</div>
        {adding && (
          <form action={action} className="mb-3 space-y-2 rounded-2xl bg-surface-2 p-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="name" required placeholder={t('roleName')} className="input bg-surface" dir="auto" />
            <input name="description" placeholder={t('description')} className="input bg-surface" dir="auto" />
            <div className="flex justify-end"><SaveButton pending={pending} status={status}>{tc('save')}</SaveButton></div>
          </form>
        )}
        {roles.length === 0 && !adding && <p className="py-6 text-center text-sm text-muted">{t('noRoles')}</p>}
        <ul className="space-y-2">
          {roles.map((r) => {
            const v = profiles.find((x) => x.id === r.volunteerId) ?? null;
            return (
              <li key={r.id} className={clsx('flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm', v ? 'border-transparent bg-surface-2' : 'border-dashed border-accent/50 bg-accent-soft/40')}>
                <div className="min-w-0 flex-1"><div className="font-medium" dir="auto">{r.name}</div>{r.description && <div className="text-xs text-muted" dir="auto">{r.description}</div>}</div>
                {v ? <span className="flex items-center gap-1.5 text-xs"><Avatar profile={v} size="sm" />{v.displayName}</span>
                  : <button type="button" className="btn-primary min-h-9 px-3 text-xs" onClick={() => start(async () => { await volunteerRoleAction(r.id, true); })}><UserPlus className="size-4" />{t('volunteer')}</button>}
                {v?.id === user.id && <button type="button" className="icon-btn size-9 text-muted" aria-label={t('withdraw')} onClick={() => start(async () => { await volunteerRoleAction(r.id, false); })}><UserMinus className="size-4" /></button>}
                {canManage && <button type="button" className="icon-btn size-9 text-muted hover:text-danger" aria-label={tc('delete')} onClick={() => start(async () => { await deleteRoleAction(r.id); })}><Trash2 className="size-4" /></button>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
