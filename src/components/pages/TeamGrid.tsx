'use client';
import { useTranslations, useLocale } from 'next-intl';
import { Avatar } from '@/components/ui/Avatar';
import { usePresence } from '@/components/presence/PresenceContext';
import { formatNumber } from '@/lib/format';
import type { Office, Profile, Task } from '@/lib/data/types';

export function TeamGrid({ profiles, offices, tasks }: { profiles: Profile[]; offices: Office[]; tasks: Task[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const { statusOf } = usePresence();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {profiles.map((p) => {
        const office = offices.find((o) => o.ownerId === p.id);
        const open = tasks.filter((x) => x.assigneeId === p.id && x.column !== 'done').length;
        const status = statusOf(p);
        return (
          <section key={p.id} className="card flex flex-col items-center p-5 text-center">
            <Avatar profile={p} size="lg" status={status} />
            <h2 className="mt-3 font-semibold">{p.displayName}</h2>
            <p className="text-sm text-muted">{p.jobTitle}</p>
            <p className="mt-1 text-xs text-muted" dir="ltr">@{p.username}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-xs">
              <span className="chip bg-surface-2">{t(`status.${status}`)}</span>
              <span className={`chip ${office ? (office.wallColor === 'teal' ? 'bg-teal-soft text-teal' : 'bg-accent-soft text-accent') : 'bg-surface-2 text-muted'}`}>
                {office ? t('team.office', { slot: formatNumber(locale, office.slot) }) : t('team.noOffice')}
              </span>
              <span className="chip bg-brand-soft text-brand">{t('nav.tasks')}: {formatNumber(locale, open)}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
