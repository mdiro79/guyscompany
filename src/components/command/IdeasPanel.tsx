'use client';
import { useOptimistic, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronUp, Lightbulb, Rocket, Trash2, ArrowRightCircle, CheckCircle2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { createIdeaAction, voteIdeaAction, setIdeaStatusAction, ideaToTaskAction, deleteIdeaAction } from '@/app/actions/command';
import { formatDate, formatNumber } from '@/lib/format';
import { IDEA_STATUSES, type IdeaKind, type IdeaStatus, type ProjectIdea } from '@/lib/data/types';

const STATUS_CLS: Record<IdeaStatus, string> = {
  new: 'bg-accent-soft text-[#b9531a] dark:text-accent',
  review: 'bg-[#e6eefb] text-[#3567c4] dark:bg-[#1c2636] dark:text-[#8fb3f2]',
  planned: 'bg-[#efe9fb] text-[#5b45c2] dark:bg-[#29233a] dark:text-[#b7a9f2]',
  done: 'bg-brand-soft text-brand',
  rejected: 'bg-surface-2 text-muted line-through',
};
type Filter = 'all' | IdeaKind;

export function IdeasPanel({ projectId, ideas, canManage }: { projectId: string; ideas: ProjectIdea[]; canManage: boolean }) {
  const t = useTranslations('command');
  const tf = useTranslations('command.form');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [, start] = useTransition();
  const [kind, setKind] = useState<IdeaKind>('idea');
  const [filter, setFilter] = useState<Filter>('all');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  // Votes flip at once; the server result follows through live refresh.
  const [shown, toggleVote] = useOptimistic(ideas, (list, id: string) => list.map((i) => (i.id !== id ? i : {
    ...i, voterIds: i.voterIds.includes(user.id) ? i.voterIds.filter((v) => v !== user.id) : [...i.voterIds, user.id],
  })));
  const rank = (s: IdeaStatus) => (s === 'done' || s === 'rejected' ? 1 : 0);
  const list = shown.filter((i) => filter === 'all' || i.kind === filter)
    .sort((a, b) => rank(a.status) - rank(b.status) || b.voterIds.length - a.voterIds.length || b.createdAt.localeCompare(a.createdAt));

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    setTitle(''); setDesc('');
    start(async () => { await createIdeaAction(projectId, { kind, title: v, description: desc }); });
  };

  return (
    <section className="space-y-3">
      <form className="card space-y-2 p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex gap-1.5">
          {(['idea', 'upgrade'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={clsx('chip min-h-8 gap-1', kind === k ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>
              {k === 'idea' ? <Lightbulb className="size-3.5" /> : <Rocket className="size-3.5" />}{t(`ideaKind.${k}`)}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={t('ideaPh')} className="input" dir="auto" />
        {title.trim() && <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder={tf('description')} className="input py-2" dir="auto" />}
        <div className="flex justify-end"><button className="btn-primary min-h-9" disabled={!title.trim()}>{tf('submit')}</button></div>
      </form>

      <div className="flex gap-1">
        {(['all', 'idea', 'upgrade'] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={clsx('chip min-h-8 gap-1', filter === f ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>
            {f === 'all' ? t('filterAll') : t(`ideaKind.${f}`)} <span className="opacity-70">{formatNumber(locale, ideas.filter((i) => f === 'all' || i.kind === f).length)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="card py-10 text-center text-sm text-muted">{t('ideasEmpty')}</p>}
      <ul className="space-y-2">
        {list.map((i) => {
          const voted = i.voterIds.includes(user.id);
          const author = profiles.find((p) => p.id === i.authorId) ?? null;
          const closed = i.status === 'done' || i.status === 'rejected';
          return (
            <li key={i.id} className={clsx('card flex gap-3 p-3', closed && 'opacity-70')}>
              <button type="button" aria-pressed={voted} aria-label={t('vote')} onClick={() => start(async () => { toggleVote(i.id); await voteIdeaAction(i.id); })}
                className={clsx('flex w-12 shrink-0 flex-col items-center justify-center rounded-xl border py-1.5 transition-colors', voted ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand hover:text-brand')}>
                <ChevronUp className="size-5" /><span className="text-sm font-semibold">{formatNumber(locale, i.voterIds.length)}</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip gap-1 border border-line text-muted">{i.kind === 'idea' ? <Lightbulb className="size-3.5" /> : <Rocket className="size-3.5" />}{t(`ideaKind.${i.kind}`)}</span>
                  {canManage ? (
                    <select aria-label={t('changeStatus')} value={i.status} onChange={(e) => start(async () => { await setIdeaStatusAction(i.id, e.target.value as IdeaStatus); })}
                      className={clsx('chip min-h-7 cursor-pointer border-0 pe-6', STATUS_CLS[i.status])}>
                      {IDEA_STATUSES.map((s) => <option key={s} value={s}>{t(`ideaStatus.${s}`)}</option>)}
                    </select>
                  ) : <span className={clsx('chip', STATUS_CLS[i.status])}>{t(`ideaStatus.${i.status}`)}</span>}
                </div>
                <h3 className="mt-1.5 font-medium" dir="auto">{i.title}</h3>
                {i.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted" dir="auto">{i.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Avatar profile={author} size="sm" /><span>{author?.displayName ?? '—'}</span><span>{formatDate(locale, i.createdAt)}</span>
                  <span className="ms-auto flex items-center gap-2">
                    {i.taskId ? (
                      <Link href={`/tasks?task=${i.taskId}`} className="flex items-center gap-1 text-brand"><CheckCircle2 className="size-3.5" />{t('onBoard')}</Link>
                    ) : canManage && !closed && (
                      <button type="button" className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-brand hover:bg-brand-soft" onClick={() => start(async () => { await ideaToTaskAction(i.id); })}>
                        <ArrowRightCircle className="size-3.5 rtl:-scale-x-100" />{t('toTask')}
                      </button>
                    )}
                    {(canManage || i.authorId === user.id) && (
                      <button type="button" className="icon-btn size-8 text-muted hover:text-danger" aria-label={t('delete')}
                        onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteIdeaAction(i.id); }); }}><Trash2 className="size-3.5" /></button>
                    )}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
