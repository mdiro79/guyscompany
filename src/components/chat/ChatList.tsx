'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Search, Users, X, Pin } from 'lucide-react';
import type { ChatSummary, FileMeta, Message, Project } from '@/lib/data/types';
import { TEAM, projectIdOf } from '@/lib/chat';
import { formatDate, formatNumber, formatTime, zonedDate } from '@/lib/format';
import { ProjectIcon } from '@/components/icons/options';
import { TopicGlyph } from '@/components/icons/glyphs';
import { useShell } from '@/components/shell/ShellContext';
import { useMessagePreview } from './preview';

// The list of chats: the team chat first, then one topic per project (active ones first), each with its
// newest message, its time and the unread count.
export function ChatList({ items, projects, files, current, opened, onOpen }: { items: ChatSummary[]; projects: Project[]; files: FileMeta[]; current: string; opened: boolean; onOpen: (c: string) => void }) {
  const t = useTranslations('chatPage');
  const tc = useTranslations('command.status');
  const locale = useLocale();
  const { profiles } = useShell();
  const preview = useMessagePreview(files);
  const [q, setQ] = useState('');
  const today = zonedDate();

  const rows = useMemo(() => {
    const order = { active: 0, planning: 1, paused: 2, done: 3 } as const;
    const project = (s: ChatSummary) => projects.find((p) => p.id === projectIdOf(s.channel)) ?? null;
    return items
      .map((s) => ({ s, p: project(s) }))
      .filter(({ s, p }) => s.channel === TEAM || p)
      .filter(({ s, p }) => !q.trim() || (s.channel === TEAM ? t('team') : p!.name).toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => {
        if (a.s.channel === TEAM) return -1;
        if (b.s.channel === TEAM) return 1;
        const st = order[a.p!.status] - order[b.p!.status];
        if (st) return st;
        return (b.s.last?.createdAt ?? b.p!.createdAt).localeCompare(a.s.last?.createdAt ?? a.p!.createdAt);
      });
  }, [items, projects, q, t]);

  const when = (m: Message) => (zonedDate(m.createdAt) === today ? formatTime(locale, m.createdAt) : formatDate(locale, m.createdAt, { day: 'numeric', month: 'short' }));
  const who = (m: Message) => profiles.find((p) => p.id === m.authorId)?.displayName;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h1 className="flex-1 text-xl font-bold">{t('title')}</h1>
      </div>
      <div className="px-3 pb-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findChat')} dir="auto"
            className="input min-h-10 rounded-full ps-9 pe-9" />
          {q && <button type="button" onClick={() => setQ('')} className="absolute top-1/2 end-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface" aria-label={t('clear')}><X className="size-4" /></button>}
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {rows.map(({ s, p }) => {
          // On phones the list is its own screen: nothing looks open there until a chat is.
          const on = s.channel === current && opened;
          const last = s.last;
          return (
            <li key={s.channel}>
              {s.channel !== TEAM && rows[1]?.s.channel === s.channel && (
                <div className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase"><TopicGlyph className="size-3.5" />{t('projectTopics')}</div>
              )}
              <button type="button" onClick={() => onOpen(s.channel)} aria-current={on ? 'true' : undefined}
                className={clsx('flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-start transition-colors active:scale-[.99]', on ? 'bg-brand text-brand-ink' : 'hover:bg-surface-2')}>
                {p ? <ProjectIcon icon={p.icon} color={p.color} size="md" /> : (
                  <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f6a04d] to-[#e0662a] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]"><Users className="size-5.5" strokeWidth={2.1} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">{p ? p.name : t('team')}</span>
                    {last && <span className={clsx('shrink-0 text-[11px]', on ? 'text-brand-ink/80' : s.unread ? 'font-semibold text-brand' : 'text-muted')}>{when(last)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={clsx('min-w-0 flex-1 truncate text-[13px]', on ? 'text-brand-ink/85' : 'text-muted')} dir="auto">
                      {last ? <>{last.kind !== 'system' && who(last) && <span className={on ? 'text-brand-ink' : 'text-ink'}>{who(last)}: </span>}{preview(last)}</>
                        : p ? tc(p.status) : t('emptyChat')}
                    </span>
                    {s.unread > 0 && <span className={clsx('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold', on ? 'bg-brand-ink text-brand' : 'bg-brand text-brand-ink')}>{formatNumber(locale, s.unread)}</span>}
                    {!s.unread && last?.pinnedAt && <Pin className="size-3.5 shrink-0 opacity-60" />}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!rows.length && <li className="py-10 text-center text-sm text-muted">{t('noChats')}</li>}
      </ul>
    </div>
  );
}

