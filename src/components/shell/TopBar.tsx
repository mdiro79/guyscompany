'use client';
import { useState, useTransition, useMemo, useEffect, useRef, useOptimistic } from 'react';
import clsx from 'clsx';
import { useTranslations, useLocale } from 'next-intl';
import { Search, Bell, CalendarDays, Sun, Moon, Menu, ChevronDown, LogOut, Settings, Shield } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { setThemeAction, setStatusAction, markNotificationsReadAction } from '@/app/actions/misc';
import { logoutAction } from '@/app/actions/auth';
import { formatTime } from '@/lib/format';
import type { Notification } from '@/lib/data/types';
import { useShell } from './ShellContext';

export interface SearchItem { kind: 'task' | 'project' | 'person'; id: string; label: string; href: string }

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

export function TopBar({ notifications, search, onMenu }: { notifications: Notification[]; search: SearchItem[]; onMenu?: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user } = useShell();
  const [, start] = useTransition();
  const [dark, setDark] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<'search' | 'bell' | 'me' | null>(null);
  const close = () => setOpen(null);
  const searchRef = useClickOutside(() => open === 'search' && close());
  const bellRef = useClickOutside(() => open === 'bell' && close());
  const meRef = useClickOutside(() => open === 'me' && close());
  const unread = notifications.filter((n) => !n.readAt).length;
  // The switch moves at once; it returns to the saved status if saving fails.
  const [focus, setFocus] = useOptimistic(user.status === 'focus');

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? search.filter((x) => x.label.toLowerCase().includes(s)).slice(0, 8) : [];
  }, [q, search]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    start(() => { setThemeAction(next ? 'dark' : 'light'); });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 short:h-12 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
      {onMenu && <button type="button" className="icon-btn lg:hidden short:hidden" onClick={onMenu} aria-label={t('nav.menu')}><Menu className="size-5" /></button>}
      <Link href="/" className="flex items-center gap-2">
        <Logo className="size-9" />
        <span className="hidden text-xl font-bold sm:inline">Guyscompany</span>
      </Link>

      <div ref={searchRef} className="relative mx-auto hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
        <input id="global-search" value={q} onChange={(e) => { setQ(e.target.value); setOpen('search'); }} onFocus={() => setOpen('search')}
          placeholder={t('common.search')} className="input rounded-full ps-9 pe-14" />
        <kbd className="absolute top-1/2 end-3 -translate-y-1/2 rounded-md border border-line px-1.5 text-[11px] text-muted" dir="ltr">⌘ K</kbd>
        {open === 'search' && results.length > 0 && (
          <ul className="card absolute inset-x-0 top-12 z-40 overflow-hidden p-1">
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2"
                  onClick={() => { close(); setQ(''); router.push(r.href); }}>
                  <span className="truncate">{r.label}</span>
                  <span className="text-xs text-muted">{t(`nav.${r.kind === 'person' ? 'team' : r.kind === 'task' ? 'tasks' : 'projects'}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ms-auto flex items-center gap-1 sm:gap-2 md:ms-0">
        <button type="button" onClick={() => start(async () => { setFocus(!focus); await setStatusAction(focus ? 'online' : 'focus'); })}
          className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm whitespace-nowrap sm:flex" aria-pressed={focus}>
          <span className={clsx('relative h-5 w-9 rounded-full transition-colors', focus ? 'bg-focus' : 'bg-line')}>
            <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', focus ? 'start-[18px]' : 'start-0.5')} />
          </span>
          {t('top.focusMode')}
        </button>
        <button type="button" onClick={toggleTheme} className="flex items-center rounded-full border border-line bg-surface p-1" aria-label={t('top.theme')}>
          <span className={clsx('rounded-full p-1.5', !dark && 'bg-surface-2')}><Sun className="size-4" /></span>
          <span className={clsx('rounded-full p-1.5', dark && 'bg-brand text-brand-ink')}><Moon className="size-4" /></span>
        </button>
        <LocaleSwitch className="min-h-10 max-sm:px-2.5" />
        <div ref={bellRef} className="relative">
          <button type="button" className="icon-btn relative" onClick={() => setOpen(open === 'bell' ? null : 'bell')} aria-label={t('top.notifications')}>
            <Bell className="size-5" />
            {unread > 0 && <span className="absolute top-1.5 end-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">{unread}</span>}
          </button>
          {open === 'bell' && (
            <div className="card absolute top-12 end-0 z-40 w-[min(22rem,calc(100vw-1.5rem))] p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="font-semibold">{t('top.notifications')}</span>
                {unread > 0 && <button type="button" className="text-xs text-brand" onClick={() => start(() => { markNotificationsReadAction(); })}>{t('top.markAllRead')}</button>}
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {notifications.length === 0 && <li className="p-3 text-sm text-muted">{t('top.noNotifications')}</li>}
                {notifications.map((n) => (
                  <li key={n.id} className={clsx('rounded-lg px-3 py-2 text-sm', !n.readAt && 'bg-accent-soft/60')}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div>{t.has(`notify.${n.kind}` as any) ? t(`notify.${n.kind}` as 'notify.mention', n.payload as Record<string, string>) : n.kind}</div>
                    <div className="text-[11px] text-muted" dir="ltr">{formatTime(locale, n.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Link href="/calendar" className="icon-btn hidden sm:inline-flex" aria-label={t('nav.calendar')}><CalendarDays className="size-5" /></Link>
        <div ref={meRef} className="relative">
          <button type="button" className="flex items-center gap-2 rounded-full p-1 pe-2 hover:bg-surface-2" onClick={() => setOpen(open === 'me' ? null : 'me')}>
            <Avatar profile={user} />
            <span className="hidden text-sm font-medium sm:inline">{user.displayName}</span>
            <ChevronDown className="hidden size-4 sm:inline" />
          </button>
          {open === 'me' && (
            <div className="card absolute top-12 end-0 z-40 w-56 p-1 text-sm">
              <Link href="/settings" onClick={close} className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-surface-2"><Settings className="size-4" />{t('settings.title')}</Link>
              {user.role === 'admin' && <Link href="/admin" onClick={close} className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-surface-2"><Shield className="size-4" />{t('nav.admin')}</Link>}
              <form action={logoutAction}>
                <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-danger hover:bg-surface-2"><LogOut className="size-4" />{t('auth.signOut')}</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
