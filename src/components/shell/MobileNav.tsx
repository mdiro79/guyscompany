'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Home, CheckSquare, Box, MessageCircle, Menu } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { isActive } from './nav';

const LINKS = [['/', 'home', Home], ['/tasks', 'tasks', CheckSquare], ['/office', 'office', Box]] as const;
const SLOTS = LINKS.length + 2;

// Bottom bar on phones. A soft pill glides to the chosen item the moment it is tapped (before the
// page has loaded), its icon springs up, and chat/menu give a short pop.
export function MobileNav({ onChat, onMenu, unreadChat }: { onChat: () => void; onMenu: () => void; unreadChat: number }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [tapped, setTapped] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const current = tapped ?? LINKS.find(([href]) => isActive(pathname, href))?.[0] ?? null;
  const index = LINKS.findIndex(([href]) => href === current);
  const bump = (key: string) => { setPop(key); window.setTimeout(() => setPop((p) => (p === key ? null : p)), 400); };
  const item = 'relative z-10 flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-300 [-webkit-tap-highlight-color:transparent]';
  const inner = 'flex flex-col items-center gap-0.5 transition-transform duration-150 active:scale-90';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex short:hidden border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <span aria-hidden className={clsx('pointer-events-none absolute top-1.5 h-11 px-2 transition-[inset-inline-start,opacity] duration-500 [transition-timing-function:cubic-bezier(.3,1.35,.5,1)]', index < 0 && 'opacity-0')}
        style={{ width: `${100 / SLOTS}%`, insetInlineStart: `${(Math.max(0, index) * 100) / SLOTS}%` }}>
        <span className="block size-full rounded-2xl bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent)]" />
      </span>
      {LINKS.map(([href, key, Icon]) => {
        const on = current === href;
        return (
          <Link key={href} href={href} onClick={() => { setTapped(href); bump(key); }} aria-current={on ? 'page' : undefined}
            className={clsx(item, on ? 'font-semibold text-brand' : 'text-muted')}>
            <span className={inner}>
              <Icon key={on ? `${key}-on` : key} className={clsx('size-5 transition-transform duration-300', on && 'gc-tab -translate-y-0.5')} strokeWidth={on ? 2.4 : 2} />
              {t(key)}
            </span>
          </Link>
        );
      })}
      <button type="button" onClick={() => { bump('chat'); onChat(); }} className={clsx(item, 'text-muted')}>
        <span className={clsx(inner, pop === 'chat' && 'gc-tab')}>
          <MessageCircle className="size-5" />{t('chat')}
        </span>
        {unreadChat > 0 && <span className="absolute top-2 start-1/2 ms-2 size-2 animate-pulse rounded-full bg-accent" />}
      </button>
      <button type="button" onClick={() => { bump('menu'); onMenu(); }} className={clsx(item, 'text-muted')}>
        <span className={clsx(inner, pop === 'menu' && 'gc-tab')}><Menu className="size-5" />{t('menu')}</span>
      </button>
    </nav>
  );
}
