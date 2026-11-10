'use client';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, AlertTriangle, Flame, Megaphone, Pin, PinOff, Sparkles, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';
import { useShell } from '@/components/shell/ShellContext';
import { deletePostAction, pinPostAction, postAnnouncementAction, saveStandupAction, sendKudosAction } from '@/app/actions/pulse';
import { formatDate, formatNumber, formatTime } from '@/lib/format';
import { announcements, kudosBoard, standupStreak } from '@/lib/pulse';
import { KUDOS_BADGES, type KudosBadge, type Post } from '@/lib/data/types';

type Tab = 'standup' | 'kudos' | 'news';
const TABS: Tab[] = ['standup', 'kudos', 'news'];
export const BADGE_EMOJI: Record<KudosBadge, string> = { thanks: '🙏', teamwork: '🤝', idea: '💡', quality: '💎', speed: '⚡', help: '🛟' };

/**
 * Team pulse: the daily standup (what I did, what is next, what blocks me), kudos between teammates and
 * announcements. Everything is visible to the whole team; a member edits or removes only their own posts
 * (admins can remove any and pin announcements).
 */
export function PulseView({ posts, today, tab: initial }: { posts: Post[]; today: string; tab?: string }) {
  const t = useTranslations('pulse');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [tab, setTab] = useState<Tab>(TABS.includes(initial as Tab) ? (initial as Tab) : 'standup');
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  const who = (id: string | null) => profiles.find((p) => p.id === id) ?? null;
  const when = (iso: string) => `${formatDate(locale, iso)} · ${formatTime(locale, iso)}`;
  const mayRemove = (p: Post) => user.role === 'admin' || p.authorId === user.id;

  const todays = posts.filter((p) => p.kind === 'standup' && p.day === today);
  const mine = todays.find((p) => p.authorId === user.id);
  const blocked = todays.filter((p) => p.blockers.trim());
  const kudos = posts.filter((p) => p.kind === 'kudos');
  const news = announcements(posts);
  const board = kudosBoard(posts, profiles.map((p) => p.id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Activity className="size-5 text-accent" />{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </div>
      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={clsx('flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors', tab === id ? 'bg-ink text-surface' : 'bg-surface-2 hover:bg-brand-soft')}>
            {t(`tab.${id}`)}
            <span className={clsx('rounded-full px-1.5 text-xs tabular-nums', tab === id ? 'bg-white/20' : 'bg-surface')}>
              {formatNumber(locale, id === 'standup' ? todays.length : id === 'kudos' ? kudos.length : news.length)}
            </span>
          </button>
        ))}
      </div>

      {tab === 'standup' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <StandupForm mine={mine} streak={standupStreak(posts, user.id, today)} />
          <section className="space-y-3">
            <div className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('standup.today', { done: formatNumber(locale, todays.length), all: formatNumber(locale, profiles.length) })}</div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(todays.length / Math.max(1, profiles.length)) * 100}%` }} /></div>
              </div>
              {blocked.length > 0 && <span className="chip bg-danger/10 text-danger"><AlertTriangle className="me-1 size-3.5" />{t('standup.blockedCount', { n: formatNumber(locale, blocked.length) })}</span>}
            </div>
            {profiles.map((p) => {
              const s = todays.find((x) => x.authorId === p.id);
              const streak = standupStreak(posts, p.id, today);
              return (
                <article key={p.id} className={clsx('card p-4', !s && 'opacity-70')}>
                  <header className="flex items-center gap-3">
                    <Avatar profile={p} />
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.displayName}</div><div className="truncate text-xs text-muted">{s ? formatTime(locale, s.createdAt) : t('standup.notYet')}</div></div>
                    {streak > 1 && <span className="chip bg-accent-soft text-accent"><Flame className="me-1 size-3.5" />{formatNumber(locale, streak)}</span>}
                  </header>
                  {s && (
                    <dl className="mt-3 space-y-2 text-sm">
                      {s.did && <div><dt className="text-xs font-medium text-muted">{t('standup.did')}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{s.did}</dd></div>}
                      {s.body && <div><dt className="text-xs font-medium text-muted">{t('standup.plan')}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{s.body}</dd></div>}
                      {s.blockers && <div className="rounded-xl bg-danger/10 p-2.5"><dt className="flex items-center gap-1 text-xs font-medium text-danger"><AlertTriangle className="size-3.5" />{t('standup.blockers')}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{s.blockers}</dd></div>}
                    </dl>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      )}

      {tab === 'kudos' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <KudosForm />
          <section className="space-y-3">
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent" />{t('kudos.board')}</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {board.map((b, i) => (
                  <li key={b.id} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 p-3 text-center">
                    <Avatar profile={who(b.id)} />
                    <span className="max-w-full truncate text-sm font-medium">{who(b.id)?.displayName}</span>
                    <span className="text-xs text-muted">{i === 0 && b.received > 0 ? '🏆 ' : ''}{t('kudos.received', { n: formatNumber(locale, b.received) })}</span>
                  </li>
                ))}
              </ul>
            </div>
            {kudos.length === 0 && <p className="card p-8 text-center text-sm text-muted">{t('kudos.empty')}</p>}
            {kudos.map((p) => (
              <article key={p.id} className="card flex gap-3 p-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl" aria-hidden>{BADGE_EMOJI[p.badge as KudosBadge] ?? '🙏'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><b>{who(p.authorId)?.displayName ?? '—'}</b> <span className="text-muted">{t('kudos.to')}</span> <b>{who(p.targetId)?.displayName ?? '—'}</b>
                    {KUDOS_BADGES.includes(p.badge as KudosBadge) && <span className="chip ms-2 bg-brand-soft text-brand">{t(`badge.${p.badge as KudosBadge}`)}</span>}</p>
                  {p.body && <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm">{p.body}</p>}
                  <p className="mt-1 text-xs text-muted">{when(p.createdAt)}</p>
                </div>
                {mayRemove(p) && <button type="button" className="icon-btn text-muted" aria-label={t('remove')} onClick={() => run(() => deletePostAction(p.id))}><Trash2 className="size-4" /></button>}
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === 'news' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <AnnouncementForm admin={user.role === 'admin'} />
          <section className="space-y-3">
            {news.length === 0 && <p className="card p-8 text-center text-sm text-muted">{t('news.empty')}</p>}
            {news.map((p) => (
              <article key={p.id} className={clsx('card p-4', p.pinned && 'border-accent/60 bg-accent-soft/40')}>
                <header className="flex items-center gap-3">
                  <Avatar profile={who(p.authorId)} size="sm" />
                  <div className="min-w-0 flex-1 text-sm"><div className="truncate font-medium">{who(p.authorId)?.displayName ?? '—'}</div><div className="truncate text-xs text-muted">{when(p.createdAt)}</div></div>
                  {p.pinned && <span className="chip bg-accent text-white"><Pin className="me-1 size-3" />{t('news.pinned')}</span>}
                  {user.role === 'admin' && (
                    <button type="button" className="icon-btn text-muted" aria-label={p.pinned ? t('news.unpin') : t('news.pin')} title={p.pinned ? t('news.unpin') : t('news.pin')} onClick={() => run(() => pinPostAction(p.id, !p.pinned))}>
                      {p.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                    </button>
                  )}
                  {mayRemove(p) && <button type="button" className="icon-btn text-muted" aria-label={t('remove')} onClick={() => run(() => deletePostAction(p.id))}><Trash2 className="size-4" /></button>}
                </header>
                <p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7">{p.body}</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function StandupForm({ mine, streak }: { mine?: Post; streak: number }) {
  const t = useTranslations('pulse');
  const locale = useLocale();
  const [state, action, pending] = useActionState(saveStandupAction, null);
  const status = useResultStatus(state);
  return (
    <form action={action} className="card h-fit space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="me-auto font-semibold">{mine ? t('standup.edit') : t('standup.write')}</h2>
        {streak > 0 && <span className="chip bg-accent-soft text-accent"><Flame className="me-1 size-3.5" />{t('standup.streak', { n: formatNumber(locale, streak) })}</span>}
      </div>
      {(['did', 'plan', 'blockers'] as const).map((field) => (
        <label key={field} className="block">
          <span className="label">{t(`standup.${field}`)}</span>
          <textarea name={field} rows={field === 'blockers' ? 2 : 3} maxLength={600} dir="auto" placeholder={t(`standup.${field}Hint`)}
            defaultValue={mine ? (field === 'plan' ? mine.body : mine[field]) : ''} className="input py-2 leading-6" />
        </label>
      ))}
      {state?.error === 'empty' && <p role="alert" className="text-xs text-danger">{t('emptyError')}</p>}
      <SaveButton pending={pending} status={status} className="btn-primary w-full">{mine ? t('standup.update') : t('standup.post')}</SaveButton>
    </form>
  );
}

function KudosForm() {
  const t = useTranslations('pulse');
  const { user, profiles } = useShell();
  const [state, action, pending] = useActionState(sendKudosAction, null);
  const status = useResultStatus(state);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  const others = profiles.filter((p) => p.id !== user.id);
  return (
    <form ref={form} action={action} className="card h-fit space-y-3 p-4">
      <h2 className="font-semibold">{t('kudos.send')}</h2>
      <fieldset>
        <legend className="label">{t('kudos.who')}</legend>
        <div className="flex flex-wrap gap-2">
          {others.map((p, i) => (
            <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface-2 py-1 ps-1 pe-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="targetId" value={p.id} defaultChecked={i === 0} required className="sr-only" />
              <Avatar profile={p} size="sm" />{p.displayName}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">{t('kudos.for')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {KUDOS_BADGES.map((b, i) => (
            <label key={b} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="badge" value={b} defaultChecked={i === 0} className="sr-only" />
              <span aria-hidden>{BADGE_EMOJI[b]}</span>{t(`badge.${b}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">{t('kudos.note')}</span>
        <textarea name="body" rows={3} maxLength={500} dir="auto" placeholder={t('kudos.noteHint')} className="input py-2 leading-6" />
      </label>
      <SaveButton pending={pending} status={status} disabled={others.length === 0} className="btn-primary w-full">{t('kudos.submit')}</SaveButton>
    </form>
  );
}

function AnnouncementForm({ admin }: { admin: boolean }) {
  const t = useTranslations('pulse');
  const [state, action, pending] = useActionState(postAnnouncementAction, null);
  const status = useResultStatus(state);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="card h-fit space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Megaphone className="size-4 text-accent" />{t('news.write')}</h2>
      <textarea name="body" rows={4} maxLength={1000} required dir="auto" placeholder={t('news.hint')} className="input py-2 leading-6" aria-label={t('news.write')} />
      {admin && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="pinned" className="size-5 accent-[var(--color-brand)]" />{t('news.pinIt')}</label>}
      <SaveButton pending={pending} status={status} className="btn-primary w-full">{t('news.post')}</SaveButton>
    </form>
  );
}
