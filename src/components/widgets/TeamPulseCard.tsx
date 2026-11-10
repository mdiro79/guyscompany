import { getLocale, getTranslations } from 'next-intl/server';
import { Activity, ArrowLeft, ArrowRight, Megaphone, Pin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { announcements } from '@/lib/pulse';
import type { Post, Profile } from '@/lib/data/types';

const FRESH_DAYS = 7;

// The team pulse at a glance on the home page: the pinned (or a fresh) announcement, how many standups
// are in today with a nudge to write one's own, and the latest kudos.
export async function TeamPulseCard({ posts, profiles, meId, today }: { posts: Post[]; profiles: Profile[]; meId: string; today: string }) {
  const t = await getTranslations('pulse');
  const locale = await getLocale();
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  const freshSince = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString();
  const news = announcements(posts).find((p) => p.pinned || p.createdAt >= freshSince);
  const todays = posts.filter((p) => p.kind === 'standup' && p.day === today);
  const mine = todays.some((p) => p.authorId === meId);
  const kudos = posts.find((p) => p.kind === 'kudos');
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  return (
    <section className="card flex flex-col gap-3 p-4 md:flex-row md:items-stretch">
      {news && (
        <Link href="/pulse?tab=news" className="flex min-w-0 flex-[2] items-start gap-3 rounded-xl bg-accent-soft p-3 transition-colors hover:bg-accent-soft/70">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">{news.pinned ? <Pin className="size-4" /> : <Megaphone className="size-4" />}</span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted">{name(news.authorId)}</span>
            <span dir="auto" className="line-clamp-2 break-words text-sm font-medium">{news.body}</span>
          </span>
        </Link>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-surface-2 p-3">
        <Activity className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('home.standups', { done: formatNumber(locale, todays.length), all: formatNumber(locale, profiles.length) })}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand" style={{ width: `${(todays.length / Math.max(1, profiles.length)) * 100}%` }} /></div>
          {kudos && <div className="mt-1.5 truncate text-xs text-muted">🙏 {name(kudos.authorId)} → {name(kudos.targetId)}</div>}
        </div>
        <Link href="/pulse" className={mine ? 'btn-ghost min-h-10 shrink-0' : 'btn-primary min-h-10 shrink-0'}>{mine ? t('home.done') : t('home.writeMine')}<Arrow className="size-4" /></Link>
      </div>
    </section>
  );
}
