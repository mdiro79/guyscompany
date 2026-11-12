'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import type { ChatRead, ChatSummary, FileMeta, Issue, Message, Milestone, Project, Task } from '@/lib/data/types';
import { TEAM, projectChannel, projectIdOf } from '@/lib/chat';
import { onMessageChange } from '@/lib/live-messages';
import { useShell } from '@/components/shell/ShellContext';
import { ChatList } from './ChatList';
import { Conversation } from './Conversation';

export interface ChatData {
  channel: string; opened: boolean; focusId: string | null; projects: Project[]; summaries: ChatSummary[]; messages: Message[]; pinned: Message[]; decisions: Message[];
  reads: ChatRead[]; tasks: Task[]; issues: Issue[]; milestones: Milestone[]; files: FileMeta[]; today: string;
}

const DOCK_KEY = 'gc-chat-dock';

// Telegram-style chat: the list of chats (team + one topic per project) and the open conversation; on
// phones the list and the conversation are two screens. Switching chats shows the messages already seen
// at once while the fresh ones load.
export function ChatApp(data: ChatData) {
  const { channel, opened, projects, summaries, messages } = data;
  const router = useRouter();
  const locale = useLocale();
  const { user } = useShell();
  const [target, setTarget] = useState(channel);
  const [phoneChat, setPhoneChat] = useState(opened);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [, startNav] = useTransition();
  const cache = useRef(new Map<string, Message[]>());
  cache.current.set(channel, messages);
  useEffect(() => { setTarget(channel); }, [channel]);
  useEffect(() => { setPhoneChat(opened); }, [opened]);

  // The project panel beside a project's chat, remembered per device.
  const [dock, setDockState] = useState(true);
  useEffect(() => { try { setDockState(localStorage.getItem(DOCK_KEY) !== '0'); } catch { /* storage blocked */ } }, []);
  const setDock = useCallback((v: boolean) => { setDockState(v); try { localStorage.setItem(DOCK_KEY, v ? '1' : '0'); } catch { /* storage blocked */ } }, []);

  // Unread counts: the server's, minus chats read here since, plus messages arriving live elsewhere.
  const [readHere, setReadHere] = useState<Record<string, string>>({});
  const [liveExtra, setLiveExtra] = useState<Record<string, { n: number; last: Message }>>({});
  useEffect(() => { setLiveExtra({}); }, [summaries]);
  useEffect(() => onMessageChange((c) => {
    if (c.type !== 'insert' || c.message.authorId === user.id) return;
    const m = c.message;
    setLiveExtra((x) => (summaries.some((s) => s.last?.id === m.id) ? x : { ...x, [m.channel]: { n: (x[m.channel]?.n ?? 0) + 1, last: m } }));
  }), [user.id, summaries]);
  const markedRead = useCallback((ch: string, at: string) => {
    setReadHere((r) => (r[ch] && r[ch] >= at ? r : { ...r, [ch]: at }));
    setLiveExtra((x) => { if (!x[ch]) return x; const n = { ...x }; delete n[ch]; return n; });
  }, []);
  const list = useMemo(() => summaries.map((s) => {
    const live = liveExtra[s.channel];
    const read = readHere[s.channel];
    const unread = read && (!s.last || read >= s.last.createdAt) ? 0 : s.unread + (live?.n ?? 0);
    return { ...s, last: live && (!s.last || live.last.createdAt > s.last.createdAt) ? live.last : s.last, unread: s.channel === target ? 0 : unread };
  }), [summaries, liveExtra, readHere, target]);

  const open = useCallback((c: string) => {
    setTarget(c);
    setPhoneChat(true);
    startNav(() => router.push(`/${locale}/chat?c=${encodeURIComponent(c)}`, { scroll: false }));
  }, [router, locale]);
  const back = useCallback(() => {
    setPhoneChat(false);
    startNav(() => router.push(`/${locale}/chat`, { scroll: false }));
  }, [router, locale]);

  const loaded = target === channel;
  const shown = loaded ? messages : cache.current.get(target) ?? [];
  const project = projects.find((p) => p.id === projectIdOf(target)) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden lg:card">
      <aside className={clsx('flex w-full min-w-0 flex-col border-line lg:w-80 lg:shrink-0 lg:border-e xl:w-[22rem]', phoneChat && 'max-lg:hidden')}>
        <ChatList items={list} projects={projects} files={data.files} current={target} opened={phoneChat || wide} onOpen={open} />
      </aside>
      <section className={clsx('min-w-0 flex-1',
        phoneChat ? 'max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--vv-top,0px)] max-lg:z-40 max-lg:h-[var(--vvh,100dvh)] max-lg:bg-bg' : 'max-lg:hidden')}>
        <Conversation key={target} channel={target} loaded={loaded} project={project} data={data} messages={shown}
          pinned={loaded ? data.pinned : []} reads={loaded ? data.reads : []} onBack={back} onRead={markedRead}
          dock={dock} setDock={setDock} chats={[TEAM, ...projects.map((p) => projectChannel(p.id))]} onOpenChat={open} />
      </section>
    </div>
  );
}
