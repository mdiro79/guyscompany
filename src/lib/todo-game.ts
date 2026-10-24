// The personal to-do game: XP and levels, daily quests and achievements. Pure functions shared by the
// server actions (which keep the score) and the to-do card (which shows it and celebrates).
import { APP_TIME_ZONE, zonedDate } from './format';

export type TodoCategory = 'personal' | 'work' | 'learning' | 'health';
export const TODO_CATEGORIES: TodoCategory[] = ['personal', 'work', 'learning', 'health'];
export const CATEGORY_EMOJI: Record<TodoCategory, string> = { personal: '🏠', work: '💼', learning: '📚', health: '🏃' };

export interface GameCounters {
  done: number; urgent: number; early: number; bestStreak: number; questDays: number;
  lastQuestDay: string | null; cat: Record<TodoCategory, number>;
}
export interface TodoStats { xp: number; counters: GameCounters }

export const emptyCounters = (): GameCounters => ({
  done: 0, urgent: 0, early: 0, bestStreak: 0, questDays: 0, lastQuestDay: null, cat: { personal: 0, work: 0, learning: 0, health: 0 },
});

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

// Counters are stored as JSON; anything missing or malformed reads as zero.
export function cleanCounters(raw: unknown): GameCounters {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cat = (o.cat && typeof o.cat === 'object' ? o.cat : {}) as Record<string, unknown>;
  return {
    done: count(o.done), urgent: count(o.urgent), early: count(o.early), bestStreak: count(o.bestStreak), questDays: count(o.questDays),
    lastQuestDay: typeof o.lastQuestDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.lastQuestDay) ? o.lastQuestDay : null,
    cat: { personal: count(cat.personal), work: count(cat.work), learning: count(cat.learning), health: count(cat.health) },
  };
}

interface Scored { priority: number; starred: boolean; due: string | null; category?: TodoCategory }

/** XP for finishing a to-do on `doneDay`: 10, +5/+10 for medium/urgent, +5 starred, +5 on time. */
export function xpFor(t: Scored, doneDay: string) {
  return 10 + t.priority * 5 + (t.starred ? 5 : 0) + (t.due && doneDay <= t.due ? 5 : 0);
}

/** Total XP needed to reach a level: 0, 100, 300, 600, 1000, … (each level asks 100 more than the last). */
export const levelStart = (level: number) => 50 * level * (level - 1);

export function levelOf(xp: number) {
  let level = 1;
  while (xp >= levelStart(level + 1)) level++;
  const start = levelStart(level), end = levelStart(level + 1);
  return { level, into: xp - start, need: end - start, pct: Math.round(((xp - start) / (end - start)) * 100) };
}

const hour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
/** Finished before 9 in the morning (team time). */
export const isEarly = (doneAtIso: string) => hour(doneAtIso) < 9;

/** Score after finishing (`sign` 1) or un-ticking (−1) a to-do that is worth `xp`. */
export function scoreDone(stats: TodoStats, t: Scored, doneAtIso: string, xp: number, sign: 1 | -1): TodoStats {
  const c = { ...stats.counters, cat: { ...stats.counters.cat } };
  const step = (n: number) => Math.max(0, n + sign);
  c.done = step(c.done);
  if (t.priority === 2) c.urgent = step(c.urgent);
  if (isEarly(doneAtIso)) c.early = step(c.early);
  const cat = t.category ?? 'personal';
  c.cat[cat] = step(c.cat[cat]);
  return { xp: Math.max(0, stats.xp + sign * xp), counters: c };
}

interface QuestTodo { done: boolean; doneAt: string | null; due: string | null; priority: number; starred: boolean; createdAt: string }

export const QUEST_BONUS = 25;
export type QuestId = 'three' | 'important' | 'plan';

/** Today's three quests and how far along they are. */
export function quests(todos: QuestTodo[], today: string): { id: QuestId; value: number; target: number; done: boolean }[] {
  const doneToday = todos.filter((t) => t.done && t.doneAt && zonedDate(t.doneAt) === today);
  const three = Math.min(3, doneToday.length);
  const important = doneToday.some((t) => t.priority === 2 || t.starred) ? 1 : 0;
  const plan = todos.some((t) => zonedDate(t.createdAt) === today && t.due !== null && t.due > today) ? 1 : 0;
  return [
    { id: 'three', value: three, target: 3, done: three >= 3 },
    { id: 'important', value: important, target: 1, done: important >= 1 },
    { id: 'plan', value: plan, target: 1, done: plan >= 1 },
  ];
}

/** Gives the daily bonus once, the first time all of today's quests are done. */
export function scoreQuests(stats: TodoStats, todos: QuestTodo[], today: string): TodoStats {
  if (stats.counters.lastQuestDay === today || !quests(todos, today).every((q) => q.done)) return stats;
  return { xp: stats.xp + QUEST_BONUS, counters: { ...stats.counters, lastQuestDay: today, questDays: stats.counters.questDays + 1 } };
}

export type AchievementId = 'finisher' | 'onFire' | 'firefighter' | 'earlyBird' | 'questHero' | 'climber' | 'balanced';
interface AchievementDef { id: AchievementId; tiers: [number, number, number]; value: (s: TodoStats) => number }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'finisher', tiers: [10, 50, 200], value: (s) => s.counters.done },
  { id: 'onFire', tiers: [3, 7, 30], value: (s) => s.counters.bestStreak },
  { id: 'firefighter', tiers: [5, 20, 50], value: (s) => s.counters.urgent },
  { id: 'earlyBird', tiers: [3, 15, 40], value: (s) => s.counters.early },
  { id: 'questHero', tiers: [1, 7, 30], value: (s) => s.counters.questDays },
  { id: 'climber', tiers: [3, 6, 10], value: (s) => levelOf(s.xp).level },
  // Every category used: the smallest count across the four.
  { id: 'balanced', tiers: [1, 5, 15], value: (s) => Math.min(...TODO_CATEGORIES.map((c) => s.counters.cat[c])) },
];

/** Each achievement's tier (0 = locked, 1 bronze, 2 silver, 3 gold), its value and the next goal. */
export function achievements(stats: TodoStats) {
  return ACHIEVEMENTS.map((a) => {
    const value = a.value(stats);
    const tier = a.tiers.filter((n) => value >= n).length as 0 | 1 | 2 | 3;
    return { id: a.id, tier, value, next: tier < 3 ? a.tiers[tier as 0 | 1 | 2] : null };
  });
}
