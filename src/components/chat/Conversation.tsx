'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Search, X, ChevronDown, Users, Pin, PanelRight, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';
import { useShell } from '@/components/shell/ShellContext';
import { usePresence } from '@/components/presence/PresenceContext';
import { useDevice } from '@/lib/device';
import { getMesh } from '@/lib/realtime/mesh';
import { uploadFile } from '@/lib/upload';
import { formatDate, formatNumber, zonedDate } from '@/lib/format';
import { addDays } from '@/lib/todos';
import { TEAM, layoutMessages, projectIdOf, seenBy, snippet, type ChatCommand } from '@/lib/chat';
import { chatIssueAction, chatTaskAction, forwardMessageAction, markChatReadAction, searchChatAction } from '@/app/actions/chat';
import type { ChatRead, Message, Project } from '@/lib/data/types';
import { ProjectIcon } from '@/components/icons/options';
import { useChat, PENDING } from './useChat';
import { MessageItem } from './MessageItem';
import { MessageMenu, type MenuActions } from './MessageMenu';
import { Composer } from './Composer';
import { TaskCardMsg, IssueCardMsg, SystemLine } from './WorkCards';
import { WorkDialog, type WorkDraft } from './WorkDialog';
import { ProjectDock } from './ProjectDock';
import { useMessagePreview } from './preview';
import type { ChatData } from './ChatApp';

const TYPING_MS = 4000;
const TYPING_RENEW_MS = 2500;

export function Conversation({ channel, loaded, project, data, messages: saved, pinned: savedPins, reads: savedReads, onBack, onRead, dock, setDock, chats, onOpenChat }: {
  channel: string; loaded: boolean; project: Project | null; data: ChatData; messages: Message[]; pinned: Message[]; reads: ChatRead[];
  onBack: () => void; onRead: (channel: string, at: string) => void; dock: boolean; setDock: (v: boolean) => void; chats: string[]; onOpenChat: (c: string) => void;
}) {
  const t = useTranslations('chatPage');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const { statusOf } = usePresence();
  const device = useDevice();
  const mesh = useMemo(() => (typeof window === 'undefined' ? null : getMesh(user.id, device)), [user.id, device]);
  const chat = useChat(channel, saved);
  const preview = useMessagePreview(data.files);
  const profileOf = useCallback((id: string | null) => profiles.find((p) => p.id === id) ?? null, [profiles]);
  const rows = useMemo(() => layoutMessages(chat.messages), [chat.messages]);
  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);

  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [work, setWork] = useState<(WorkDraft & { key: number }) | null>(null);
  const [forward, setForward] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dockSheet, setDockSheet] = useState(false);
  const [localFiles, setLocalFiles] = useState<Record<string, { url: string; mime: string; name: string; size: number }>>({});
  const say = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast((x) => (x === s ? null : x)), 2200); }, []);

  // Reads and typing from teammates arrive over the live links (no database writes for them).
  const [liveReads, setLiveReads] = useState<Record<string, string>>({});
  const reads = useMemo(() => {
    const map = new Map(savedReads.map((r) => [r.userId, r]));
    for (const [userId, at] of Object.entries(liveReads)) { const cur = map.get(userId); if (!cur || at > cur.readAt) map.set(userId, { userId, channel, readAt: at }); }
    return [...map.values()];
  }, [savedReads, liveReads, channel]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!mesh) return;
    return mesh.onEvent((from, msg) => {
      if (from.userId === user.id) return;
      if (msg.type === 'chat-read' && msg.channel === channel && typeof msg.at === 'string') { const at = msg.at; setLiveReads((r) => (r[from.userId] && r[from.userId] >= at ? r : { ...r, [from.userId]: at })); }
      // The office chat sends "typing" without a channel: that is the team chat.
      if (msg.type === 'typing' && (typeof msg.channel === 'string' ? msg.channel : TEAM) === channel) {
        setTyping((x) => ({ ...x, [from.userId]: msg.on ? Date.now() + TYPING_MS : 0 }));
      }
    });
  }, [mesh, channel, user.id]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  const typingNames = profiles.filter((p) => (typing[p.id] ?? 0) > (clock || Date.now())).map((p) => p.displayName);
  const typingSent = useRef(0);
  const sendTyping = useCallback((on: boolean) => {
    const now = Date.now();
    if (on && now - typingSent.current < TYPING_RENEW_MS) return;
    if (!on && !typingSent.current) return;
    typingSent.current = on ? now : 0;
    mesh?.sendEvent({ type: 'typing', on, channel });
  }, [mesh, channel]);

  // Scrolling: open at the first unread message (or the bottom), keep to the bottom while there, load
  // older messages near the top without jumping, and count what arrives below while scrolled up.
  const list = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [below, setBelow] = useState(0);
  const positioned = useRef(false);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const readAt = useMemo(() => data.summaries.find((s) => s.channel === channel)?.readAt ?? null, [data.summaries, channel]);
  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  const lastId = chat.messages.at(-1)?.id;
  const firstId = chat.messages[0]?.id;

  useLayoutEffect(() => {
    const el = list.current;
    if (!el || positioned.current || !rows.length) return;
    positioned.current = true;
    const first = readAt ? chat.messages.find((m) => m.createdAt > readAt && m.authorId !== user.id && !m.id.startsWith(PENDING)) : null;
    if (first && first.id !== lastId) {
      setUnreadFrom(first.id);
      requestAnimationFrame(() => {
        const node = el.querySelector(`[data-unread]`);
        if (node) (node as HTMLElement).scrollIntoView({ block: 'start' }); else el.scrollTop = el.scrollHeight;
      });
    } else el.scrollTop = el.scrollHeight;
  }, [rows.length, readAt, chat.messages, lastId, user.id]);

  useLayoutEffect(() => {
    const el = list.current;
    if (!el || !anchor.current) return;
    el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height);
    anchor.current = null;
  }, [firstId]);

  const prevLast = useRef(lastId);
  useEffect(() => {
    if (!positioned.current || lastId === prevLast.current) return;
    prevLast.current = lastId;
    const el = list.current;
    const last = chat.messages.at(-1);
    if (!el || !last) return;
    if (atBottomRef.current || last.authorId === user.id) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    else setBelow((n) => n + 1);
  }, [lastId, chat.messages, user.id]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottomRef.current) { atBottomRef.current = bottom; setAtBottom(bottom); }
    if (bottom) setBelow(0);
    if (el.scrollTop < 300 && chat.hasOlder && !chat.loadingOlder && positioned.current) {
      anchor.current = { height: el.scrollHeight, top: el.scrollTop };
      void chat.loadOlder().then((n) => { if (!n) anchor.current = null; });
    }
  };
  // Content that grows after it appears (pictures loading, a new card filling in) keeps the chat at the
  // bottom when it was there.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current; const inner = content.current;
    if (!el || !inner || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atBottomRef.current && positioned.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);
  const toBottom = () => { const el = list.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setBelow(0); };

  // Seen: the newest message counts as read while the chat is open at the bottom and the page is visible.
  const marked = useRef('');
  useEffect(() => {
    const last = [...chat.messages].reverse().find((m) => !m.id.startsWith(PENDING));
    if (!loaded || !atBottom || !last || last.createdAt <= marked.current) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      marked.current = last.createdAt;
      onRead(channel, last.createdAt);
      mesh?.sendEvent({ type: 'chat-read', channel, at: last.createdAt });
      void markChatReadAction(channel, last.createdAt);
    }, 400);
    return () => window.clearTimeout(id);
  }, [chat.messages, atBottom, loaded, channel, onRead, mesh]);

  // Jumps to a message (a reply's original, a pin, a search hit), loading older pages until it is there.
  const pendingJump = useRef<{ id: string; tries: number } | null>(null);
  const jumpTo = useCallback((id: string) => {
    const el = list.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlight(id);
      window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1700);
      pendingJump.current = null;
      return;
    }
    if (!chat.hasOlder || (pendingJump.current?.tries ?? 0) > 12) { pendingJump.current = null; say(t('notFound')); return; }
    pendingJump.current = { id, tries: (pendingJump.current?.id === id ? pendingJump.current.tries : 0) + 1 };
    void chat.loadOlder();
  }, [chat, say, t]);
  useEffect(() => { const j = pendingJump.current; if (j) requestAnimationFrame(() => jumpTo(j.id)); }, [firstId, jumpTo]);
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !data.focusId || !loaded || !rows.length || data.channel !== channel) return;
    focused.current = true;
    window.setTimeout(() => jumpTo(data.focusId!), 120);
  }, [data.focusId, data.channel, channel, loaded, rows.length, jumpTo]);

  // Pinned messages: the bar shows one; tapping goes to it and moves to the one before (like Telegram).
  const pins = useMemo(() => {
    const map = new Map(savedPins.map((m) => [m.id, m]));
    for (const m of chat.messages) map.set(m.id, m);
    return [...map.values()].filter((m) => m.pinnedAt).sort((a, b) => a.pinnedAt!.localeCompare(b.pinnedAt!));
  }, [savedPins, chat.messages]);
  const [pinAt, setPinAt] = useState(-1);
  const pin = pins.length ? pins[(pinAt < 0 || pinAt >= pins.length ? pins.length - 1 : pinAt)] : null;
  const pinIndex = pin ? pins.indexOf(pin) : -1;

  // Decisions of this chat (newest first) for the project dock.
  const decisions = useMemo(() => {
    const map = new Map((loaded ? data.decisions : []).map((m) => [m.id, m]));
    for (const m of chat.messages) map.set(m.id, m);
    return [...map.values()].filter((m) => m.kind === 'decision').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [chat.messages, data.decisions, loaded]);

  // Search inside this chat.
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!searching || q.trim().length < 2) { setHits(null); return; }
    const id = window.setTimeout(async () => { const r = await searchChatAction([channel], q).catch(() => null); setHits(r?.ok ? r.messages ?? [] : []); }, 280);
    return () => window.clearTimeout(id);
  }, [q, searching, channel]);

  const isManager = !!project && project.managerId === user.id;
  const canDecide = (m: Message) => (m.kind === 'text' || m.kind === 'decision') && !!m.body && (m.authorId === user.id || user.role === 'admin' || isManager);

  const send = useCallback(async (text: string, file: File | null) => {
    setError(null);
    const replyToId = reply?.id ?? null;
    setReply(null);
    let fileId: string | null = null;
    if (file) {
      try { fileId = await uploadFile(file); } catch { setError(t('uploadFailed')); return false; }
      const url = URL.createObjectURL(file);
      setLocalFiles((f) => ({ ...f, [fileId!]: { url, mime: file.type, name: file.name, size: file.size } }));
    }
    const ok = await chat.send(text, fileId, { replyToId });
    if (!ok) setError(t('sendFailed'));
    return ok;
  }, [chat, reply, t]);

  const command = useCallback(async (c: ChatCommand) => {
    setError(null);
    const replyToId = reply?.id ?? null;
    setReply(null);
    if (c.cmd === 'decision') { if (!(await chat.send(c.text, null, { decision: true, replyToId }))) setError(t('sendFailed')); return; }
    if (c.cmd === 'bug' && !project) { setWork({ kind: 'bug', title: c.title, description: '', replyToId, key: Date.now() }); return; }
    const r = c.cmd === 'task'
      ? await chatTaskAction({ channel, title: c.title, assigneeId: c.assigneeId, priority: c.priority, dueDate: c.dueDate, projectId: project?.id ?? null, replyToId })
      : await chatIssueAction({ channel, projectId: project!.id, title: c.title, severity: c.severity, assigneeId: c.assigneeId, replyToId });
    if (r.ok && r.sent) { chat.add(r.sent); say(c.cmd === 'task' ? t('taskMade') : t('bugMade')); } else setError(t('workFailed'));
  }, [chat, reply, project, channel, say, t]);

  const menuMsg = menu ? byId.get(menu.id) ?? null : null;
  const actions: MenuActions | null = menuMsg ? (() => {
    const m = menuMsg;
    const mine = m.authorId === user.id;
    const plain = m.kind === 'text' || m.kind === 'decision';
    const firstLine = m.body.split('\n')[0].slice(0, 200);
    return {
      reply: () => { setEditing(null); setReply(m); },
      copy: () => { void navigator.clipboard?.writeText(m.body).then(() => say(t('copied'))).catch(() => {}); },
      edit: mine && plain ? () => { setReply(null); setEditing(m); } : undefined,
      pin: () => chat.pin(m.id, !m.pinnedAt),
      forward: plain ? () => setForward(m) : undefined,
      decide: canDecide(m) ? () => chat.decide(m.id, m.kind !== 'decision') : undefined,
      task: plain && m.body ? () => setWork({ kind: 'task', title: firstLine, description: m.body, replyToId: m.id, key: Date.now() }) : undefined,
      bug: plain && m.body && data.projects.length ? () => setWork({ kind: 'bug', title: firstLine, description: m.body, replyToId: m.id, key: Date.now() }) : undefined,
      remove: mine || user.role === 'admin' ? () => { if (confirm(t('confirmDelete'))) chat.remove(m.id); } : undefined,
      react: (e: string) => chat.react(m.id, e),
    };
  })() : null;

  const editLast = () => { const m = [...chat.messages].reverse().find((x) => x.authorId === user.id && (x.kind === 'text' || x.kind === 'decision') && !x.id.startsWith(PENDING)); if (m) setEditing(m); };
  const reactionsBy = useCallback((ids: string[]) => ids.map((id) => profileOf(id)?.displayName ?? '—').join('، '), [profileOf]);
  const dayLabel = (day: string) => {
    const today = zonedDate();
    if (day === today) return t('today');
    if (day === addDays(today, -1)) return t('yesterday');
    return formatDate(locale, `${day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const online = profiles.filter((p) => statusOf(p) !== 'offline').length;
  const subtitle = typingNames.length ? null
    : project ? t('topicOf', { status: t(`pstatus.${project.status}`) }) : t('members', { n: formatNumber(locale, profiles.length), online: formatNumber(locale, online) });
  const openDock = () => { if (window.matchMedia('(min-width: 1280px)').matches) setDock(!dock); else setDockSheet(true); };

  const dockEl = project && (
    <ProjectDock project={project} tasks={data.tasks} issues={data.issues} milestones={data.milestones} decisions={decisions} today={data.today}
      onClose={() => { setDockSheet(false); if (window.matchMedia('(min-width: 1280px)').matches) setDock(false); }}
      onNewTask={() => { setDockSheet(false); setWork({ kind: 'task', title: '', description: '', replyToId: null, key: Date.now() }); }}
      onNewBug={() => { setDockSheet(false); setWork({ kind: 'bug', title: '', description: '', replyToId: null, key: Date.now() }); }}
      onJump={(id) => { setDockSheet(false); jumpTo(id); }} />
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="relative z-10 flex min-h-14 items-center gap-2 border-b border-line bg-surface/95 px-2 backdrop-blur sm:px-3">
          {searching ? (
            <>
              <Search className="ms-2 size-5 shrink-0 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchIn')} dir="auto" className="min-h-11 flex-1 bg-transparent text-[15px] outline-none" />
              <button type="button" className="icon-btn" onClick={() => { setSearching(false); setQ(''); }} aria-label={t('close')}><X className="size-5" /></button>
            </>
          ) : (
            <>
              <button type="button" onClick={onBack} className="icon-btn lg:hidden" aria-label={t('back')}><ArrowRight className="size-5 ltr:rotate-180" /></button>
              <button type="button" onClick={project ? openDock : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-start">
                {project ? <ProjectIcon icon={project.icon} color={project.color} size="sm" /> : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#f6a04d] to-[#e0662a] text-white"><Users className="size-4" strokeWidth={2.2} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold leading-5" dir="auto">{project ? project.name : t('team')}</span>
                  <span className="block truncate text-xs leading-4 text-muted">
                    {typingNames.length ? (
                      <span className="flex items-center gap-1 text-brand">
                        <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="gc-dot size-1 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                        {t('typing', { names: typingNames.join('، '), n: typingNames.length })}
                      </span>
                    ) : subtitle}
                  </span>
                </span>
              </button>
              {!loaded && <Loader2 className="size-4 shrink-0 animate-spin text-muted" />}
              <button type="button" className="icon-btn" onClick={() => setSearching(true)} aria-label={t('search')}><Search className="size-5" /></button>
              {project && <button type="button" className={clsx('icon-btn', dock && 'xl:bg-brand-soft xl:text-brand')} onClick={openDock} aria-label={t('projectPanel')}><PanelRight className="size-5 rtl:-scale-x-100" /></button>}
            </>
          )}
        </header>

        {/* Search results */}
        {searching && hits && (
          <div className="absolute inset-x-0 top-14 z-20 max-h-[60%] overflow-y-auto border-b border-line bg-surface shadow-lg">
            {hits.length === 0 ? <p className="p-6 text-center text-sm text-muted">{t('noResults')}</p> : hits.map((m) => (
              <button key={m.id} type="button" onClick={() => { setSearching(false); setQ(''); jumpTo(m.id); }} className="flex w-full items-center gap-3 border-b border-line/60 px-3 py-2.5 text-start hover:bg-surface-2">
                <Avatar profile={profileOf(m.authorId)} size="sm" />
                <span className="min-w-0 flex-1"><span className="flex justify-between gap-2 text-xs"><span className="font-semibold">{profileOf(m.authorId)?.displayName}</span><span className="text-muted">{formatDate(locale, m.createdAt, { day: 'numeric', month: 'short' })}</span></span>
                  <span className="block truncate text-sm text-muted" dir="auto">{snippet(m, 120)}</span></span>
              </button>
            ))}
          </div>
        )}

        {/* Pinned bar */}
        {pin && !searching && (
          <div className="relative z-10 flex min-h-12 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-start"
              onClick={() => { jumpTo(pin.id); setPinAt(pinIndex <= 0 ? pins.length - 1 : pinIndex - 1); }}>
              <span className="flex h-8 w-[3px] shrink-0 flex-col gap-0.5">
                {pins.slice(0, 4).map((_, i) => <span key={i} className={clsx('flex-1 rounded-full', i === Math.min(3, pinIndex) ? 'bg-brand' : 'bg-brand/30')} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-brand">{pins.length > 1 ? t('pinnedN', { n: formatNumber(locale, pinIndex + 1) }) : t('pinned')}</span>
                <span className="block truncate text-[13px]" dir="auto">{preview(pin)}</span>
              </span>
            </button>
            <button type="button" className="icon-btn size-9 text-muted" onClick={() => chat.pin(pin.id, false)} aria-label={t('unpin')}><Pin className="size-4" /></button>
          </div>
        )}

        {!loaded && <div className="absolute inset-x-0 top-14 z-10 h-0.5 overflow-hidden"><div className="h-full w-1/3 animate-[gc-shine_1s_linear_infinite] bg-brand" /></div>}

        {/* Messages */}
        <div ref={list} onScroll={onScroll} className="gc-wallpaper relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin">
          <div ref={content} className="flex min-h-full flex-col pt-2 pb-3">
          {chat.loadingOlder && <div className="flex justify-center py-2"><Loader2 className="size-5 animate-spin text-muted" /></div>}
          {!chat.hasOlder && rows.length > 0 && (
            <div className="mx-auto my-3 max-w-xs rounded-2xl bg-surface/80 px-4 py-3 text-center text-xs text-muted backdrop-blur">
              {project ? t('topicStart', { name: project.name }) : t('teamStart')}
            </div>
          )}
          {rows.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              {project ? <ProjectIcon icon={project.icon} color={project.color} size="lg" /> : <span className="text-5xl">👋</span>}
              <p className="max-w-xs text-sm text-muted">{project ? t('emptyTopic') : t('emptyChat')}</p>
              {project && <p className="max-w-xs rounded-2xl bg-surface/80 px-3 py-2 text-xs text-muted">{t('cmdHint')}</p>}
            </div>
          )}
          {rows.map((row) => {
            const m = row.message;
            const replyTo = m.replyToId ? byId.get(m.replyToId) ?? null : null;
            return (
              <div key={m.id}>
                {row.newDay && (
                  <div className="sticky top-1 z-[5] my-2 flex justify-center">
                    <span className="rounded-full bg-black/30 px-3 py-0.5 text-xs font-medium text-white backdrop-blur dark:bg-white/15">{dayLabel(row.day)}</span>
                  </div>
                )}
                {unreadFrom === m.id && (
                  <div data-unread className="my-2 bg-surface/70 py-1 text-center text-xs font-semibold text-brand backdrop-blur">{t('unreadBelow')}</div>
                )}
                {m.kind === 'system' ? <SystemLine m={m} /> : (
                  <MessageItem row={row} mine={m.authorId === user.id} author={profileOf(m.authorId)} forwardedFrom={profileOf(m.forwardedFrom)}
                    replyTo={replyTo} replyAuthor={profileOf(replyTo?.authorId ?? null)} replyPreview={replyTo ? preview(replyTo) : ''}
                    file={m.fileId ? data.files.find((f) => f.id === m.fileId) ?? null : null} localFile={m.fileId ? localFiles[m.fileId] ?? null : null}
                    sending={m.id.startsWith(PENDING)} seen={seenBy(m, reads).length > 0} highlight={highlight === m.id} meId={user.id} reactionsBy={reactionsBy}
                    card={m.kind === 'task' ? <TaskCardMsg task={data.tasks.find((x) => x.id === m.refId) ?? null} title={m.body} />
                      : m.kind === 'issue' ? <IssueCardMsg issue={data.issues.find((x) => x.id === m.refId) ?? null} title={m.body} /> : undefined}
                    onReply={(x) => { setEditing(null); setReply(x); }} onMenu={(x, cx, cy) => setMenu({ id: x.id, x: cx, y: cy })}
                    onReact={(x, e) => chat.react(x.id, e)} onJump={jumpTo} onImage={setViewer} />
                )}
              </div>
            );
          })}
          {typingNames.length > 0 && (
            <div className="mt-2 flex items-end gap-2 px-2 sm:px-4">
              <span className="flex w-9 justify-center"><Avatar profile={profiles.find((p) => p.displayName === typingNames[0]) ?? null} size="sm" /></span>
              <span className="flex h-9 items-center gap-1 rounded-2xl rounded-es-md bg-surface px-3.5 shadow-[0_1px_1px_rgba(0,0,0,.08)]">
                {[0, 1, 2].map((i) => <span key={i} className="gc-dot size-2 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            </div>
          )}
          </div>
        </div>

        {/* Back to the newest message */}
        {!atBottom && (
          <button type="button" onClick={toBottom} aria-label={t('toBottom')}
            className="absolute end-3 bottom-24 z-10 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lg transition active:scale-90">
            <ChevronDown className="size-6" />
            {below > 0 && <span className="absolute -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-ink">{formatNumber(locale, below)}</span>}
          </button>
        )}
        {toast && <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center"><span className="gc-menu rounded-full bg-ink px-4 py-2 text-sm text-surface shadow-lg">{toast}</span></div>}

        <Composer channel={channel} profiles={profiles} meId={user.id} today={data.today} reply={reply} replyAuthor={profileOf(reply?.authorId ?? null)}
          replyPreview={reply ? preview(reply) : ''} editing={editing} canBug={!!project} error={error}
          onCancel={() => { setReply(null); setEditing(null); }} onSend={send}
          onSaveEdit={(text) => { if (editing) chat.edit(editing.id, text); setEditing(null); }}
          onCommand={(c) => void command(c)} onTyping={sendTyping} onEditLast={editLast} />
      </div>

      {/* The project beside its chat: a panel on wide screens, a sheet elsewhere */}
      {project && dock && <aside className="hidden w-[22rem] shrink-0 border-s border-line xl:block">{dockEl}</aside>}
      {project && dockSheet && (
        <div className="fixed inset-0 z-50 xl:hidden" onClick={() => setDockSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 end-0 w-[min(24rem,92vw)] shadow-2xl" onClick={(e) => e.stopPropagation()}>{dockEl}</div>
        </div>
      )}

      {menuMsg && actions && (
        <MessageMenu message={menuMsg} at={{ x: menu!.x, y: menu!.y }} actions={actions} onClose={() => setMenu(null)}
          seenBy={menuMsg.authorId === user.id ? seenBy(menuMsg, reads).map((id) => profileOf(id)).filter((p): p is NonNullable<typeof p> => !!p) : []} />
      )}
      {work && (
        <WorkDialog key={work.key} draft={work} channel={channel} projects={data.projects} defaultProjectId={project?.id ?? null}
          onClose={() => setWork(null)} onDone={(m) => { chat.add(m); say(work.kind === 'task' ? t('taskMade') : t('bugMade')); }} />
      )}
      <Dialog open={!!forward} onClose={() => setForward(null)} title={t('forwardTo')}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {chats.map((c) => {
            const p = data.projects.find((x) => x.id === projectIdOf(c));
            return (
              <button key={c} type="button" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 p-2 text-xs font-medium transition hover:bg-brand-soft active:scale-95"
                onClick={async () => {
                  const m = forward; setForward(null);
                  if (!m) return;
                  const r = await forwardMessageAction(m.id, c).catch(() => null);
                  if (!r?.ok || !r.sent) { say(t('sendFailed')); return; }
                  if (c === channel) chat.add(r.sent); else { say(t('forwarded')); onOpenChat(c); }
                }}>
                {p ? <ProjectIcon icon={p.icon} color={p.color} size="md" /> : <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f6a04d] to-[#e0662a] text-white"><Users className="size-5" /></span>}
                <span className="max-w-full truncate" dir="auto">{p ? p.name : t('team')}</span>
              </button>
            );
          })}
        </div>
      </Dialog>
      {viewer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button type="button" className="absolute top-4 end-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label={t('close')}><X className="size-6" /></button>
        </div>
      )}
    </div>
  );
}
