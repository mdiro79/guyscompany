'use client';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CheckCheck, Flame, Siren, Sunrise, Trophy, Mountain, Scale, Target, Star, CalendarPlus, Lock } from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/format';
import { addDays } from '@/lib/todos';
import { achievements, levelOf, quests, QUEST_BONUS, type AchievementId, type QuestId, type TodoStats } from '@/lib/todo-game';
import type { Todo } from '@/lib/data/types';

// The game parts of the personal to-do card: level badge and XP bar, the week strip, today's quests
// and the achievements. Colours: gold/orange for XP, the brand green for done.

const HEX = 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)';

export function LevelBadge({ xp }: { xp: number }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  const { level } = levelOf(xp);
  return (
    <div className="relative size-14 shrink-0" title={t('lv', { n: formatNumber(locale, level) })}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#ffcf5c] via-[#f59e2c] to-[#e2651f] shadow-[0_6px_16px_rgba(240,122,42,0.35)]" style={{ clipPath: HEX }} />
      <div className="absolute inset-[3px] flex flex-col items-center justify-center bg-gradient-to-br from-[#fff4d8] to-[#ffe0a8] text-[#8a4a0f] dark:from-[#3b2a14] dark:to-[#2a1d0c] dark:text-[#ffcf5c]" style={{ clipPath: HEX }}>
        <span className="text-[9px] font-semibold uppercase leading-none opacity-80">{t('level')}</span>
        <span className="text-lg font-extrabold leading-tight">{formatNumber(locale, level)}</span>
      </div>
    </div>
  );
}

export function XpBar({ xp, gain }: { xp: number; gain: number }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  const { into, need, pct } = levelOf(xp);
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#ffc24a] to-[#f07a2a] transition-[width] duration-700 ease-out rtl:bg-gradient-to-l"
          style={{ width: `${Math.max(3, pct)}%` }}>
          <span className="gc-shine absolute inset-0" />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
        <span>{t('xpOf', { into: formatNumber(locale, into), need: formatNumber(locale, need) })}</span>
        {gain > 0 && <span className="gc-pop font-semibold text-[#e2651f]">{t('xpGain', { n: formatNumber(locale, gain) })}</span>}
      </div>
    </div>
  );
}

// The current week (Saturday first in Persian, Monday in English) with a tick on days with something done.
export function WeekStrip({ doneDays, today }: { doneDays: Set<string>; today: string }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const first = locale === 'fa' ? 6 : 1;
  const start = addDays(today, -((weekday - first + 7) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="flex items-center justify-between gap-1" aria-label={t('week')}>
      {days.map((d) => {
        const done = doneDays.has(d), isToday = d === today, future = d > today;
        const name = formatDate(locale, `${d}T12:00:00Z`, { weekday: 'short' });
        return (
          <div key={d} className="flex flex-1 flex-col items-center gap-1" title={done ? t('dayDone', { day: name }) : name}>
            <span className={clsx('text-[10px]', isToday ? 'font-bold text-ink' : 'text-muted')}>{formatDate(locale, `${d}T12:00:00Z`, { weekday: 'narrow' })}</span>
            <span className={clsx('flex size-7 items-center justify-center rounded-full text-[11px] transition-all',
              done ? 'bg-brand text-brand-ink shadow-sm' : isToday ? 'border-2 border-accent text-accent' : future ? 'bg-surface-2/50 text-muted/50' : 'bg-surface-2 text-muted')}>
              {done ? <Check className="size-3.5" strokeWidth={3} /> : formatNumber(locale, Number(d.slice(8)))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const QUEST_ICON: Record<QuestId, typeof Target> = { three: CheckCheck, important: Star, plan: CalendarPlus };

export function QuestsPanel({ todos, today, stats }: { todos: Todo[]; today: string; stats: TodoStats }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  const list = quests(todos, today);
  const all = list.every((q) => q.done);
  const paid = stats.counters.lastQuestDay === today;
  return (
    <div className="space-y-2">
      {list.map((q) => {
        const Icon = QUEST_ICON[q.id];
        return (
          <div key={q.id} className={clsx('flex items-center gap-3 rounded-xl border p-2.5 transition-colors', q.done ? 'border-brand/40 bg-brand-soft' : 'border-line')}>
            <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', q.done ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>
              {q.done ? <Check className="size-5" strokeWidth={3} /> : <Icon className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={clsx('text-sm', q.done && 'font-medium')}>{t(`quest.${q.id}`)}</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(q.value / q.target) * 100}%` }} />
                </div>
                <span className="text-[11px] text-muted">{formatNumber(locale, q.value)}/{formatNumber(locale, q.target)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 text-xs', all ? 'bg-gradient-to-r from-[#fff1cf] to-[#ffe2b0] font-semibold text-[#8a4a0f] dark:from-[#3b2a14] dark:to-[#2a1d0c] dark:text-[#ffcf5c]' : 'bg-surface-2 text-muted')}>
        <Trophy className="size-4 shrink-0" />
        <span className="flex-1">{all || paid ? t('questsDone', { n: formatNumber(locale, QUEST_BONUS) }) : t('questBonus', { n: formatNumber(locale, QUEST_BONUS) })}</span>
        <span className="opacity-70">{t('questsNew')}</span>
      </div>
    </div>
  );
}

const BADGE_ICON: Record<AchievementId, typeof Target> = {
  finisher: CheckCheck, onFire: Flame, firefighter: Siren, earlyBird: Sunrise, questHero: Trophy, climber: Mountain, balanced: Scale,
};
const TIER_FILL = [
  'bg-surface-2 text-muted/60',
  'bg-gradient-to-br from-[#e7b48a] to-[#a8683a] text-white',
  'bg-gradient-to-br from-[#eef1f5] to-[#9aa5b4] text-[#3c4656]',
  'bg-gradient-to-br from-[#ffe08a] to-[#e2a21b] text-[#6b4300]',
];

export function BadgesPanel({ stats }: { stats: TodoStats }) {
  const t = useTranslations('todos');
  const locale = useLocale();
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {achievements(stats).map((a) => {
        const Icon = BADGE_ICON[a.id];
        return (
          <li key={a.id} className={clsx('flex flex-col items-center gap-1 rounded-2xl border border-line p-3 text-center', a.tier === 0 && 'opacity-80')}>
            <div className="relative size-14">
              <div className={clsx('absolute inset-0 flex items-center justify-center', TIER_FILL[a.tier])} style={{ clipPath: HEX }}>
                {a.tier ? <Icon className="size-6" /> : <Lock className="size-5" />}
              </div>
              {a.tier > 0 && <span className="absolute -bottom-1 start-1/2 flex -translate-x-1/2 gap-0.5 rtl:translate-x-1/2">{Array.from({ length: a.tier }, (_, i) => <Star key={i} className="size-3 fill-[#f6c544] text-[#e2a21b]" />)}</span>}
            </div>
            <div className="mt-1 text-sm font-semibold">{t(`badge.${a.id}`)}</div>
            <div className="text-[11px] text-muted">{a.tier ? t(`tier${a.tier}` as 'tier1') : t('locked')}</div>
            {a.next !== null ? (
              <>
                <div className="text-[11px] text-muted">{t(`badgeGoal.${a.id}`, { n: formatNumber(locale, a.next) })}</div>
                <div className="mt-0.5 flex w-full items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#ffc24a] to-[#f07a2a] rtl:bg-gradient-to-l" style={{ width: `${Math.min(100, (a.value / a.next) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted">{formatNumber(locale, Math.min(a.value, a.next))}/{formatNumber(locale, a.next)}</span>
                </div>
              </>
            ) : <div className="text-[11px] font-semibold text-[#e2a21b]">{t('maxed')}</div>}
          </li>
        );
      })}
    </ul>
  );
}
