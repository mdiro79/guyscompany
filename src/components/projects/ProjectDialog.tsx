'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { IconChoice, AvatarChoice } from '@/components/ui/IconChoice';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';
import { useShell } from '@/components/shell/ShellContext';
import { saveProjectAction } from '@/app/actions/projects';
import { PROJECT_STATUSES, type Project } from '@/lib/data/types';
import { PROJECT_COLORS, PROJECT_COLOR_KEYS, PROJECT_ICONS, PROJECT_ICON_KEYS, PROJECT_STATUS_STYLE, LEVEL4_STYLE, ProjectIcon } from '@/components/icons/options';

// Create or edit a project: everything with names is a tap on an icon (look, status, priority, people).
export function ProjectDialog({ open, project, onClose }: { open: boolean; project: Project | null; onClose: () => void }) {
  const t = useTranslations('projects');
  const tm = useTranslations('command');
  const tc = useTranslations('common');
  const { user, profiles } = useShell();
  const [state, action, pending] = useActionState(saveProjectAction, null);
  const status = useResultStatus(state);
  const [icon, setIcon] = useState(project?.icon ?? 'rocket');
  const [color, setColor] = useState(project?.color ?? 'green');
  const [name, setName] = useState(project?.name ?? '');
  // Closes once per successful save (the same result must not close the dialog when it opens again).
  const handled = useRef(state);
  useEffect(() => { if (state?.ok && handled.current !== state) { handled.current = state; onClose(); } }, [state, onClose]);
  useEffect(() => { setIcon(project?.icon ?? 'rocket'); setColor(project?.color ?? 'green'); setName(project?.name ?? ''); }, [project, open]);

  return (
    <Dialog open={open} onClose={onClose} title={project ? t('edit') : t('new')} wide>
      <form action={action} className="space-y-5" key={project?.id ?? 'new'}>
        {project && <input type="hidden" name="id" value={project.id} />}
        <input type="hidden" name="icon" value={icon} />
        <input type="hidden" name="color" value={color} />

        {/* Look: a live preview, the icon grid and the colours */}
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <ProjectIcon icon={icon} color={color} size="lg" className="gc-pop" key={`${icon}-${color}`} />
          <div className="min-w-0 flex-1">
            <label className="label">{t('name')}</label>
            <input name="name" required value={name} onChange={(e) => setName(e.target.value)} className="input bg-surface" dir="auto" maxLength={120} />
          </div>
        </div>
        <div>
          <div className="label">{t('icon')}</div>
          <div className="grid grid-cols-8 gap-1.5">
            {PROJECT_ICON_KEYS.map((k) => {
              const Icon = PROJECT_ICONS[k];
              const on = k === icon;
              return (
                <button key={k} type="button" onClick={() => setIcon(k)} aria-pressed={on} aria-label={t(`icons.${k}`)} title={t(`icons.${k}`)}
                  className={clsx('flex aspect-square items-center justify-center rounded-xl border-2 transition active:scale-90', on ? 'border-brand bg-brand-soft text-brand' : 'border-transparent bg-surface-2 text-muted hover:text-ink')}>
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROJECT_COLOR_KEYS.map((k) => {
              const [a, b] = PROJECT_COLORS[k];
              return (
                <button key={k} type="button" onClick={() => setColor(k)} aria-pressed={k === color} aria-label={t(`colors.${k}`)} title={t(`colors.${k}`)}
                  className={clsx('flex size-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition active:scale-90', k === color && 'ring-2 ring-ink')}
                  style={{ background: `linear-gradient(140deg, ${a}, ${b})` }}>
                  {k === color && <Check className="size-4" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        <div><label className="label">{t('goal')}</label>
          <textarea name="goal" rows={2} defaultValue={project?.goal} placeholder={t('goalHint')} className="input py-2" dir="auto" maxLength={1000} /></div>
        <div><label className="label">{t('description')}</label>
          <textarea name="description" rows={2} defaultValue={project?.description} className="input py-2" dir="auto" /></div>

        <IconChoice name="status" label={tm('changeStatus')} defaultValue={project?.status ?? 'planning'}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: tm(`status.${s}`), icon: PROJECT_STATUS_STYLE[s].icon('size-7'), tone: PROJECT_STATUS_STYLE[s].tone }))} />
        <IconChoice name="priority" label={t('priorityLabel')} defaultValue={project?.priority ?? 1}
          options={LEVEL4_STYLE.map((s, i) => ({ value: i, label: t(`priority.${i}`), icon: s.icon('size-7'), tone: s.tone }))} />

        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('start')}</label><input type="date" name="startDate" defaultValue={project?.startDate ?? ''} className="input" /></div>
          <div><label className="label">{tm('due')}</label><input type="date" name="dueDate" defaultValue={project?.dueDate ?? ''} className="input" /></div>
        </div>

        <AvatarChoice name="managerId" label={t('manager')} profiles={profiles} defaultValue={[project?.managerId ?? user.id]} />
        <AvatarChoice name="memberIds" label={t('team')} profiles={profiles} multiple defaultValue={project?.memberIds ?? [user.id]} />

        {state?.error === 'dates' && <p className="text-sm text-danger">{t('datesWrong')}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tc('cancel')}</button><SaveButton pending={pending} status={status}>{tc('save')}</SaveButton></div>
      </form>
    </Dialog>
  );
}
