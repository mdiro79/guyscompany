'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Flag, Ban } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { IconChoice, AvatarChoice, DueChoice } from '@/components/ui/IconChoice';
import { saveTaskAction } from '@/app/actions/tasks';
import { TASK_COLUMNS, TASK_PRIORITIES, type Milestone, type Project, type Task, type TaskColumn } from '@/lib/data/types';
import { useShell } from '@/components/shell/ShellContext';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';
import { COLUMN_STYLE, PRIORITY_STYLE, EFFORT_STYLE, ProjectIcon } from '@/components/icons/options';

// A task with taps instead of lists: its stage, priority and size as icon tiles, people as portraits,
// the project as its icon and the phase (milestone) of that project.
export function TaskDialog({ open, onClose, task, projects, milestones = [], defaultColumn = 'idea', defaultProjectId = null }: {
  open: boolean; onClose: () => void; task: Task | null; projects: Project[]; milestones?: Milestone[]; defaultColumn?: TaskColumn; defaultProjectId?: string | null;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const { profiles } = useShell();
  const [state, action, pending] = useActionState(saveTaskAction, null);
  const status = useResultStatus(state);
  const handled = useRef(state);
  useEffect(() => { if (state?.ok && handled.current !== state) { handled.current = state; onClose(); } }, [state, onClose]);
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? '');
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? '');
  const [blocked, setBlocked] = useState(!!task?.blockedReason);
  useEffect(() => { setProjectId(task?.projectId ?? defaultProjectId ?? ''); setMilestoneId(task?.milestoneId ?? ''); setBlocked(!!task?.blockedReason); }, [task, open, defaultProjectId]);
  const phases = milestones.filter((m) => m.projectId === projectId);

  return (
    <Dialog open={open} onClose={onClose} title={task ? t('editTask') : t('newTask')} wide>
      <form action={action} className="space-y-5" key={task?.id ?? 'new'}>
        {task && <input type="hidden" name="id" value={task.id} />}
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="milestoneId" value={projectId ? milestoneId : ''} />
        <div><label className="label">{t('taskTitle')}</label><input name="title" required maxLength={200} defaultValue={task?.title} className="input" dir="auto" autoFocus={!task} /></div>
        <div><label className="label">{t('description')}</label><textarea name="description" rows={2} defaultValue={task?.description} className="input py-2" dir="auto" /></div>

        <IconChoice name="column" label={t('column')} defaultValue={task?.column ?? defaultColumn}
          options={TASK_COLUMNS.map((c) => ({ value: c, label: t(`col_${c}`), icon: COLUMN_STYLE[c].icon('size-7'), tone: COLUMN_STYLE[c].tone }))} />
        <div className="grid gap-5 sm:grid-cols-2">
          <IconChoice name="priority" label={t('priority')} defaultValue={task?.priority ?? 0}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: t(`priority${p}`), icon: PRIORITY_STYLE[p].icon('size-6'), tone: PRIORITY_STYLE[p].tone }))} />
          <IconChoice name="effort" label={t('effort')} size="sm" defaultValue={task?.effort ?? 0}
            options={[0, 1, 2, 3, 4].map((e) => ({ value: e, label: t(`effort${e as 0}`), icon: EFFORT_STYLE[e].icon('size-5'), tone: EFFORT_STYLE[e].tone }))} />
        </div>

        <AvatarChoice name="assigneeId" label={t('assignee')} profiles={profiles} defaultValue={task?.assigneeId ? [task.assigneeId] : []} allowNone noneLabel={t('unassignedShort')} />

        <IconChoice label={t('project')} size="sm" value={projectId} onChange={(v) => { setProjectId(v); setMilestoneId(''); }}
          options={[{ value: '', label: t('noProject'), icon: <span className="flex size-6 items-center justify-center rounded-lg border-2 border-dashed border-current text-xs">–</span>, tone: 'slate' as const },
            ...projects.filter((p) => p.status !== 'done' || p.id === task?.projectId).map((p) => ({ value: p.id, label: p.name, icon: <ProjectIcon icon={p.icon} color={p.color} size="xs" />, tone: 'brand' as const }))]} />
        {projectId && phases.length > 0 && (
          <IconChoice label={t('phase')} size="sm" value={milestoneId} onChange={setMilestoneId}
            options={[{ value: '', label: t('noPhase'), icon: <Flag className="size-4 opacity-50" />, tone: 'slate' as const },
              ...phases.map((m) => ({ value: m.id, label: m.title, icon: <Flag className={clsx('size-4', m.done && 'fill-current')} />, tone: (m.done ? 'brand' : 'orange') as 'brand' | 'orange' }))]} />
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <DueChoice name="dueDate" label={t('dueDate')} defaultValue={task?.dueDate ?? null} />
          <div><label className="label">{t('startDate')}</label><input type="date" name="startDate" defaultValue={task?.startDate ?? ''} className="input min-h-10" /></div>
        </div>

        <div className="rounded-2xl bg-surface-2 p-3">
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-medium">
            <span className={clsx('flex size-9 items-center justify-center rounded-xl transition', blocked ? 'bg-danger text-white' : 'bg-surface text-muted')}><Ban className="size-5" /></span>
            <span className="flex-1">{t('isBlocked')}</span>
            <input type="checkbox" name="blocked" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} className="size-5 accent-[var(--danger)]" />
          </label>
          {blocked && <input name="blockedReason" defaultValue={task?.blockedReason} placeholder={t('blockedHint')} maxLength={300} className="input mt-2 bg-surface" dir="auto" />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">{t('checklist')}</label>
            <textarea name="checklist" rows={3} defaultValue={task?.checklist.map((s) => s.text).join('\n')} placeholder={t('checklistHint')} className="input py-2 leading-6" dir="auto" /></div>
          <div className="space-y-3">
            <div><label className="label">{t('tags')}</label><input name="tags" defaultValue={task?.tags.join(', ')} className="input" dir="auto" /></div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="needsVolunteer" defaultChecked={task?.needsVolunteer} className="size-5 accent-[var(--accent)]" />{t('needsVolunteer')}</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>{tc('cancel')}</button>
          <SaveButton pending={pending} status={status}>{tc('save')}</SaveButton>
        </div>
      </form>
    </Dialog>
  );
}
