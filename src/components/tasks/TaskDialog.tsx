'use client';
import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from '@/components/ui/Dialog';
import { saveTaskAction } from '@/app/actions/tasks';
import { TASK_COLUMNS, TASK_PRIORITIES, type Project, type Task, type TaskColumn } from '@/lib/data/types';
import { useShell } from '@/components/shell/ShellContext';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

export function TaskDialog({ open, onClose, task, projects, defaultColumn = 'idea' }: {
  open: boolean; onClose: () => void; task: Task | null; projects: Project[]; defaultColumn?: TaskColumn;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const { profiles } = useShell();
  const [state, action, pending] = useActionState(saveTaskAction, null);
  const status = useResultStatus(state);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  return (
    <Dialog open={open} onClose={onClose} title={task ? t('editTask') : t('newTask')}>
      <form action={action} className="space-y-3" key={task?.id ?? 'new'}>
        {task && <input type="hidden" name="id" value={task.id} />}
        <div><label className="label">{t('taskTitle')}</label><input name="title" required maxLength={200} defaultValue={task?.title} className="input" dir="auto" /></div>
        <div><label className="label">{t('description')}</label><textarea name="description" rows={3} defaultValue={task?.description} className="input py-2" dir="auto" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">{t('column')}</label>
            <select name="column" defaultValue={task?.column ?? defaultColumn} className="input">
              {TASK_COLUMNS.map((c) => <option key={c} value={c}>{t(`col_${c}`)}</option>)}
            </select>
          </div>
          <div><label className="label">{t('assignee')}</label>
            <select name="assigneeId" defaultValue={task?.assigneeId ?? ''} className="input">
              <option value="">{tc('unassigned')}</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </div>
          <div><label className="label">{t('project')}</label>
            <select name="projectId" defaultValue={task?.projectId ?? ''} className="input">
              <option value="">{t('noProject')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('tags')}</label><input name="tags" defaultValue={task?.tags.join(', ')} className="input" dir="auto" /></div>
          <div><label className="label">{t('priority')}</label>
            <select name="priority" defaultValue={task?.priority ?? 0} className="input">
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority${p}`)}</option>)}
            </select>
          </div>
          <div className="max-sm:hidden" />
          <div><label className="label">{t('startDate')}</label><input type="date" name="startDate" defaultValue={task?.startDate ?? ''} className="input" /></div>
          <div><label className="label">{t('dueDate')}</label><input type="date" name="dueDate" defaultValue={task?.dueDate ?? ''} className="input" /></div>
        </div>
        <div><label className="label">{t('checklist')}</label>
          <textarea name="checklist" rows={3} defaultValue={task?.checklist.map((s) => s.text).join('\n')} placeholder={t('checklistHint')} className="input py-2 leading-6" dir="auto" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="needsVolunteer" defaultChecked={task?.needsVolunteer} className="size-5 accent-[var(--accent)]" />{t('needsVolunteer')}</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{tc('cancel')}</button>
          <SaveButton pending={pending} status={status}>{tc('save')}</SaveButton>
        </div>
      </form>
    </Dialog>
  );
}
