'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Lock, EyeOff, Gavel, ArrowUpRight } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useShell } from '@/components/shell/ShellContext';
import { createPollAction, voteAction, closePollAction, decidePollAction } from '@/app/actions/polls';
import { moveTaskAction } from '@/app/actions/tasks';
import { summarizePoll, rankClosedPolls } from '@/lib/polls';
import { formatDate, formatNumber, formatTime } from '@/lib/format';
import type { Poll, PollVote, Task, Project } from '@/lib/data/types';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

export function IdeasView({ polls, votes, ideas, projects }: { polls: Poll[]; votes: PollVote[]; ideas: Task[]; projects: Project[] }) {
  const t = useTranslations('ideas');
  const tc = useTranslations('common');
  const tw = useTranslations('widgets');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const [state, action, pending] = useActionState(createPollAction, null);
  const status = useResultStatus(state);
  useEffect(() => { if (state?.ok) setCreating(false); }, [state]);
  const { ranked, tie } = rankClosedPolls(polls, votes);
  const managerOf = (p: Poll) => {
    const task = ideas.find((x) => x.id === p.taskId);
    return projects.find((x) => x.id === task?.projectId)?.managerId ?? null;
  };
  const canManage = (p: Poll) => user.role === 'admin' || p.createdBy === user.id || managerOf(p) === user.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <button type="button" className="btn-primary ms-auto min-h-10" onClick={() => setCreating(true)}><Plus className="size-4" />{t('newPoll')}</button>
      </div>
      {tie && <p className="flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm"><Gavel className="size-4" />{t('tie')}</p>}
      {polls.length === 0 && <p className="card p-8 text-center text-sm text-muted">{t('empty')}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {polls.map((p) => {
          const s = summarizePoll(p, votes, user.id);
          const idea = ideas.find((x) => x.id === p.taskId);
          const rank = ranked.findIndex((r) => r.poll.id === p.id);
          return (
            <section key={p.id} className="card p-4">
              <div className="flex items-start gap-2">
                <h2 className="flex-1 font-semibold" dir="auto">{p.question}</h2>
                <span className={clsx('chip', s.isClosed ? 'bg-surface-2 text-muted' : 'bg-brand-soft text-brand')}>{s.isClosed ? t('closed') : t('open')}</span>
              </div>
              {idea && <p className="mt-1 text-xs text-muted">{t('forIdea')}: <span dir="auto">{idea.title}</span></p>}
              <p className="mt-1 text-xs text-muted">{t('closesAt')}: {formatDate(locale, p.closesAt)} {formatTime(locale, p.closesAt)}</p>
              <div className="mt-4 grid grid-cols-10 gap-1" dir="ltr">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" disabled={s.isClosed} onClick={() => run(() => voteAction(p.id, n))} aria-pressed={s.myScore === n}
                    className={clsx('flex h-10 items-center justify-center rounded-lg text-sm font-medium', s.myScore === n ? 'bg-brand text-brand-ink' : 'bg-surface-2 hover:bg-brand-soft disabled:hover:bg-surface-2')}>
                    {formatNumber(locale, n)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">{t('voted', { n: formatNumber(locale, s.voteCount), total: formatNumber(locale, profiles.length) })}</span>
                {s.isClosed && s.average !== null
                  ? <span className="ms-auto font-semibold text-brand">{t('average', { avg: formatNumber(locale, s.average, 1) })}{rank === 0 && ' 🏆'}</span>
                  : <span className="ms-auto flex items-center gap-1 text-xs text-muted"><EyeOff className="size-3.5" />{tw('hiddenScore')}</span>}
                {!s.isClosed && canManage(p) && <button type="button" className="btn-ghost min-h-9 text-xs" onClick={() => run(() => closePollAction(p.id))}><Lock className="size-3.5" />{t('close')}</button>}
              </div>
              {p.decision && <p className="mt-3 rounded-xl bg-teal-soft p-2 text-sm">{t('decision', { text: p.decision })}</p>}
              {s.isClosed && tie && rank <= 1 && canManage(p) && !p.decision && (
                <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => decidePollAction(p.id, decision[p.id] ?? '')); }}>
                  <input className="input min-h-10" value={decision[p.id] ?? ''} onChange={(e) => setDecision({ ...decision, [p.id]: e.target.value })} dir="auto" />
                  <button className="btn-primary min-h-10">{t('decide')}</button>
                </form>
              )}
              {s.isClosed && idea && idea.column === 'idea' && canManage(p) && (
                <button type="button" className="mt-3 flex items-center gap-1 text-sm text-brand" onClick={() => run(() => moveTaskAction(idea.id, 'in_progress'))}><ArrowUpRight className="size-4" />{t('promote')}</button>
              )}
            </section>
          );
        })}
      </div>
      <Dialog open={creating} onClose={() => setCreating(false)} title={t('newPoll')}>
        <form action={action} className="space-y-3">
          <div><label className="label">{t('question')}</label><input name="question" required className="input" dir="auto" /></div>
          <div><label className="label">{t('forIdea')}</label>
            <select name="taskId" className="input"><option value="">{tc('none')}</option>{ideas.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
          <div><label className="label">{t('hours')}</label><input type="number" name="hours" min={1} max={720} defaultValue={24} className="input" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{tc('cancel')}</button><SaveButton pending={pending} status={status}>{tc('create')}</SaveButton></div>
        </form>
      </Dialog>
    </div>
  );
}
