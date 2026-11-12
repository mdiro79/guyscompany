'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from '@/components/ui/Dialog';
import { IconChoice, AvatarChoice, DueChoice } from '@/components/ui/IconChoice';
import { PRIORITY_STYLE, LEVEL4_STYLE, ProjectIcon } from '@/components/icons/options';
import { useShell } from '@/components/shell/ShellContext';
import { chatTaskAction, chatIssueAction } from '@/app/actions/chat';
import type { Message, Project } from '@/lib/data/types';

export interface WorkDraft { kind: 'task' | 'bug'; title: string; description: string; replyToId: string | null }

// Turns a message into a task or a bug, all with taps: project, who, how urgent, when.
export function WorkDialog({ draft, channel, projects, defaultProjectId, onClose, onDone }: {
  draft: WorkDraft | null; channel: string; projects: Project[]; defaultProjectId: string | null; onClose: () => void; onDone: (m: Message) => void;
}) {
  const t = useTranslations('chatPage');
  const tt = useTranslations('tasks');
  const { profiles } = useShell();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const bug = draft?.kind === 'bug';
  const live = projects.filter((p) => p.status !== 'done');
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? (bug ? live[0]?.id ?? '' : ''));
  const [assignee, setAssignee] = useState<string[]>([]);
  const [priority, setPriority] = useState(0);
  const [severity, setSeverity] = useState(1);
  const [due, setDue] = useState<string | null>(null);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');

  const submit = () => start(async () => {
    if (!draft || !title.trim()) return;
    setError(false);
    const r = bug
      ? await chatIssueAction({ channel, projectId, title, description, severity, assigneeId: assignee[0] ?? null, replyToId: draft.replyToId })
      : await chatTaskAction({ channel, projectId: projectId || null, title, description, assigneeId: assignee[0] ?? null, priority, dueDate: due, replyToId: draft.replyToId });
    if (r.ok && r.sent) { onDone(r.sent); onClose(); } else setError(true);
  });

  return (
    <Dialog open={!!draft} onClose={onClose} title={bug ? t('makeBug') : t('makeTask')} wide>
      <div className="space-y-4">
        <div><label className="label">{tt('taskTitle')}</label><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input" dir="auto" autoFocus /></div>
        <div><label className="label">{tt('description')}</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input py-2" dir="auto" /></div>
        <IconChoice label={tt('project')} size="sm" value={projectId} onChange={setProjectId}
          options={[...(bug ? [] : [{ value: '', label: tt('noProject'), icon: <span className="flex size-6 items-center justify-center rounded-lg border-2 border-dashed border-current text-xs">–</span>, tone: 'slate' as const }]),
            ...live.map((p) => ({ value: p.id, label: p.name, icon: <ProjectIcon icon={p.icon} color={p.color} size="xs" />, tone: 'brand' as const }))]} />
        <AvatarChoice label={bug ? t('whoFixes') : tt('assignee')} profiles={profiles} value={assignee} onChange={setAssignee} allowNone noneLabel={tt('unassignedShort')} />
        {bug ? (
          <IconChoice label={t('severity')} value={severity} onChange={setSeverity}
            options={LEVEL4_STYLE.map((s, i) => ({ value: i, label: t(`sev.${i}`), icon: s.icon('size-6'), tone: s.tone }))} />
        ) : (
          <>
            <IconChoice label={tt('priority')} value={priority} onChange={setPriority}
              options={PRIORITY_STYLE.map((s, i) => ({ value: i, label: tt(`priority${i}`), icon: s.icon('size-6'), tone: s.tone }))} />
            <DueChoice label={tt('dueDate')} value={due} onChange={setDue} />
          </>
        )}
        {error && <p className="text-sm text-danger">{t('workFailed')}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" disabled={pending || !title.trim() || (bug && !projectId)} onClick={submit}>{pending ? t('creating') : bug ? t('createBug') : t('createTask')}</button>
        </div>
      </div>
    </Dialog>
  );
}
