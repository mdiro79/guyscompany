'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { X, MessageCircle } from 'lucide-react';
import { isEmbedded, useDevice } from '@/lib/device';
import { getMesh } from '@/lib/realtime/mesh';
import { connectBoard } from '@/lib/board/sync';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { useLive, setLivePaused } from '@/lib/live';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PresenceProvider } from '@/components/presence/PresenceProvider';
import { VoiceProvider } from '@/components/voice/VoiceProvider';
import type { FileMeta, Message, Notification, Profile } from '@/lib/data/types';
import { ShellProvider, type ShellData } from './ShellContext';
import { Sidebar } from './Sidebar';
import { TopBar, type SearchItem } from './TopBar';
import { MobileNav } from './MobileNav';
import { NAV, ADMIN_NAV, isActive } from './nav';

// Keeps the drawing boards and the conference presentation in sync on every page (the board can be
// drawn on from a phone on /board while the computer is in the office).
function BoardSync({ userId }: { userId: string }) {
  const device = useDevice();
  useEffect(() => connectBoard(getMesh(userId, device), userId), [userId, device]);
  return null;
}

const LIVE_TABLES = ['tasks', 'messages', 'reactions', 'notifications', 'polls', 'poll_votes', 'profiles', 'offices', 'files', 'focus_items', 'todos', 'rooms', 'issues', 'issue_comments', 'project_ideas', 'idea_votes', 'milestones', 'calendar_events', 'projects', 'project_roles', 'office_swap_requests', 'private_chat_invites'];

export function AppShell({ data: server, notifications, messages, files, search, children }: {
  data: ShellData; notifications: Notification[]; messages: Message[]; files: FileMeta[]; search: SearchItem[]; children: ReactNode;
}) {
  // Optimistic changes to one's own profile (character, status, name) until the server data catches up.
  const [patch, setPatch] = useState<Partial<Profile> | null>(null);
  useEffect(() => {
    if (patch && Object.entries(patch).every(([k, v]) => server.user[k as keyof Profile] === v)) setPatch(null);
  }, [server.user, patch]);
  const data = useMemo<ShellData>(() => {
    if (!patch) return { ...server, patchUser: setPatch };
    const user = { ...server.user, ...patch };
    return { ...server, user, profiles: server.profiles.map((p) => (p.id === user.id ? user : p)), patchUser: setPatch };
  }, [server, patch]);
  const t = useTranslations();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [chat, setChat] = useState(false);
  // The chat list is capped, so unread messages are counted from the last one seen rather than by length.
  const lastId = messages.at(-1)?.id;
  const [seenId, setSeenId] = useState(lastId);
  useLive(LIVE_TABLES);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => { if (chat) setSeenId(lastId); }, [chat, lastId]);
  const unreadChat = useMemo(() => {
    const from = seenId ? messages.findIndex((m) => m.id === seenId) + 1 : 0;
    return messages.slice(from).filter((m) => m.authorId !== data.user.id).length;
  }, [messages, seenId, data.user.id]);
  const fullBleed = pathname.startsWith('/office') || pathname.startsWith('/board');
  // Embedded on a 3D monitor: no presence, voice or sidebar (the parent page owns those).
  // The ?embed=1 flag only exists on the first page; later navigation inside the iframe stays embedded too.
  const embedParam = useSearchParams().get('embed') === '1';
  const [framed, setFramed] = useState(false);
  useEffect(() => setFramed(isEmbedded()), []);
  const embed = embedParam || framed;
  // Inside the office the dashboard stays loaded while hidden (instant monitor); the office says when it is shown.
  useEffect(() => {
    if (!embed) return;
    const h = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === window.parent && e.data?.type === 'gc-monitor-visible') setLivePaused(!e.data.visible);
    };
    window.addEventListener('message', h);
    window.parent.postMessage({ type: 'gc-embed-hello' }, window.location.origin);
    return () => window.removeEventListener('message', h);
  }, [embed]);
  if (embed) {
    const items = (data.user.role === 'admin' ? [...NAV, ADMIN_NAV] : NAV).filter((n) => n.href !== '/office' && n.href !== '/board');
    return (
      <ShellProvider value={data}>
        <div className="flex min-h-dvh flex-col">
          <TopBar notifications={notifications} search={search} />
          {/* Section tabs (the sidebar is too wide for a monitor) */}
          <nav className="sticky top-16 z-20 flex gap-1 overflow-x-auto border-b border-line bg-bg/95 px-2 py-1.5 backdrop-blur scrollbar-thin short:top-12">
            {items.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} className={clsx('flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium',
                isActive(pathname, href) ? 'bg-brand text-brand-ink' : 'text-muted hover:bg-surface-2')}>
                <Icon className="size-4" />{t(`nav.${key}`)}
              </Link>
            ))}
          </nav>
          <div className="flex flex-1">
            <main className="min-w-0 flex-1 p-3 sm:p-4">{children}</main>
            <aside className="sticky top-28 hidden h-[calc(100dvh-7rem)] w-80 shrink-0 border-s border-line bg-surface xl:flex"><ChatPanel messages={messages} files={files} className="w-full" /></aside>
          </div>
        </div>
      </ShellProvider>
    );
  }

  return (
    <ShellProvider value={data}>
      <PresenceProvider>
        <VoiceProvider>
          <BoardSync userId={data.user.id} />
          {fullBleed ? children : (
            <div className="flex min-h-dvh flex-col">
              {data.demo && <div className="bg-accent px-4 py-1 text-center text-xs text-white">{t('common.demoBanner')}</div>}
              <TopBar notifications={notifications} search={search} onMenu={() => setDrawer(true)} />
              <div className="flex flex-1">
                <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 border-e border-line lg:block short:top-12 short:block short:h-[calc(100dvh-3rem)] short:w-56"><Sidebar /></aside>
                <main className="min-w-0 flex-1 p-3 pb-24 sm:p-4 lg:pb-4 short:pb-4">{children}</main>
                <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-80 shrink-0 border-s border-line bg-surface xl:flex 2xl:w-96">
                  <ChatPanel messages={messages} files={files} className="w-full" />
                </aside>
              </div>
              <MobileNav onChat={() => setChat(true)} onMenu={() => setDrawer(true)} unreadChat={unreadChat} />
              <button type="button" onClick={() => setChat(true)} aria-label={t('nav.chat')}
                className="fixed bottom-6 end-6 z-30 hidden size-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg lg:flex xl:hidden short:flex short:bottom-3 short:end-3 short:size-12">
                <MessageCircle className="size-6" />
              </button>
              {/* Drawer (phone/tablet) */}
              <div className={clsx('fixed inset-0 z-40 lg:hidden', drawer ? 'visible' : 'invisible')}>
                <div className={clsx('absolute inset-0 bg-black/40 transition-opacity', drawer ? 'opacity-100' : 'opacity-0')} onClick={() => setDrawer(false)} />
                <div className={clsx('absolute inset-y-0 start-0 w-[min(20rem,85vw)] bg-bg shadow-xl transition-transform',
                  drawer ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full')}>
                  <button type="button" className="icon-btn absolute top-2 end-2 z-10" onClick={() => setDrawer(false)} aria-label={t('common.close')}><X className="size-5" /></button>
                  <Sidebar onNavigate={() => setDrawer(false)} />
                </div>
              </div>
              {/* Full-screen chat (below xl) */}
              {chat && (
                <div className="fixed inset-0 z-50 flex flex-col bg-surface xl:hidden">
                  <button type="button" className="icon-btn absolute top-3 end-3 z-10" onClick={() => setChat(false)} aria-label={t('common.close')}><X className="size-5" /></button>
                  <ChatPanel messages={messages} files={files} className="h-full pb-[env(safe-area-inset-bottom)]" />
                </div>
              )}
            </div>
          )}
        </VoiceProvider>
      </PresenceProvider>
    </ShellProvider>
  );
}
