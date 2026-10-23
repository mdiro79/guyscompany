'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Home, CheckSquare, Box, MessageCircle, Menu } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { isActive } from './nav';

export function MobileNav({ onChat, onMenu, unreadChat }: { onChat: () => void; onMenu: () => void; unreadChat: number }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {([['/', 'home', Home], ['/tasks', 'tasks', CheckSquare], ['/office', 'office', Box]] as const).map(([href, key, Icon]) => (
        <Link key={href} href={href} className={clsx(item, isActive(pathname, href) ? 'text-brand' : 'text-muted')}>
          <Icon className="size-5" />{t(key)}
        </Link>
      ))}
      <button type="button" onClick={onChat} className={clsx(item, 'relative text-muted')}>
        <MessageCircle className="size-5" />{t('chat')}
        {unreadChat > 0 && <span className="absolute top-2 start-1/2 ms-2 size-2 rounded-full bg-accent" />}
      </button>
      <button type="button" onClick={onMenu} className={clsx(item, 'text-muted')}><Menu className="size-5" />{t('menu')}</button>
    </nav>
  );
}
