'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { VoicePanel } from '@/components/voice/VoicePanel';
import { usePresence } from '@/components/presence/PresenceContext';
import { NAV, ADMIN_NAV, isActive } from './nav';
import { useShell } from './ShellContext';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, profiles } = useShell();
  const { statusOf } = usePresence();
  const items = user.role === 'admin' ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 scrollbar-thin">
      <VoicePanel />
      <nav className="space-y-1">
        {items.map(({ href, key, icon: Icon }) => (
          <Link key={href} href={href} onClick={onNavigate}
            className={clsx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
              isActive(pathname, href) ? 'bg-brand text-brand-ink' : 'hover:bg-surface-2')}>
            <Icon className="size-5" />{t(`nav.${key}`)}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line pt-4">
        <div className="mb-2 px-1 font-semibold">{t('home.teamMembers')}</div>
        <ul className="space-y-1">
          {profiles.map((p) => {
            const status = statusOf(p);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <Avatar profile={p} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.displayName}</div>
                  <div className="truncate text-xs text-muted">{p.jobTitle}</div>
                </div>
                <span className={clsx('flex items-center gap-1.5 text-[11px]', status === 'focus' ? 'text-focus' : 'text-muted')}>
                  <span className={clsx('size-2 rounded-full', { online: 'bg-online', busy: 'bg-busy', focus: 'bg-focus', offline: 'bg-muted/50' }[status])} />
                  {t(`status.${status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-auto px-1 text-[11px] text-muted">Guyscompany · Better together · v0.1</div>
    </div>
  );
}
