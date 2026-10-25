import { describe, expect, it } from 'vitest';
import { achievements, cleanCounters, emptyCounters, isEarly, levelOf, quests, scoreDone, scoreQuests, xpFor, QUEST_BONUS, type TodoStats } from './todo-game';

const fresh = (): TodoStats => ({ xp: 0, counters: emptyCounters() });
const todo = (o: Partial<{ done: boolean; doneAt: string | null; due: string | null; priority: number; starred: boolean; createdAt: string }>) => ({
  done: false, doneAt: null, due: null, priority: 0, starred: false, createdAt: '2026-10-20T08:00:00Z', ...o,
});

describe('to-do game', () => {
  it('scores a to-do by priority, star and being on time', () => {
    expect(xpFor({ priority: 0, starred: false, due: null }, '2026-10-24')).toBe(10);
    expect(xpFor({ priority: 2, starred: true, due: '2026-10-24' }, '2026-10-24')).toBe(30);
    expect(xpFor({ priority: 1, starred: false, due: '2026-10-23' }, '2026-10-24')).toBe(15); // late: no bonus
  });

  it('turns XP into levels with growing steps', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100, pct: 0 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 200, pct: 0 });
    expect(levelOf(450)).toEqual({ level: 3, into: 150, need: 300, pct: 50 });
    expect(levelOf(1000).level).toBe(5);
  });

  it('gives and takes back the same score when a to-do is ticked and un-ticked', () => {
    const t = { priority: 2, starred: false, due: null, category: 'work' as const };
    const at = '2026-10-24T03:30:00Z'; // 07:00 in Tehran: early
    expect(isEarly(at)).toBe(true);
    const on = scoreDone(fresh(), t, at, 20, 1);
    expect(on.xp).toBe(20);
    expect(on.counters).toMatchObject({ done: 1, urgent: 1, early: 1, cat: { work: 1, personal: 0 } });
    expect(scoreDone(on, t, at, 20, -1)).toEqual(fresh());
    expect(scoreDone(fresh(), t, at, 20, -1)).toEqual(fresh()); // never below zero
  });

  it('tracks the daily quests and pays the bonus once a day', () => {
    const today = '2026-10-24';
    const list = [
      todo({ done: true, doneAt: '2026-10-24T06:00:00Z' }),
      todo({ done: true, doneAt: '2026-10-24T07:00:00Z', starred: true }),
      todo({ done: true, doneAt: '2026-10-24T09:00:00Z' }),
      todo({ createdAt: '2026-10-24T05:00:00Z', due: '2026-10-25' }),
    ];
    expect(quests(list.slice(0, 2), today).map((q) => q.done)).toEqual([false, true, false]);
    expect(quests(list, today).every((q) => q.done)).toBe(true);
    const once = scoreQuests(fresh(), list, today);
    expect(once.xp).toBe(QUEST_BONUS);
    expect(once.counters).toMatchObject({ questDays: 1, lastQuestDay: today });
    expect(scoreQuests(once, list, today)).toBe(once);
  });

  it('reads stored counters defensively and works out achievement tiers', () => {
    expect(cleanCounters({ done: 12, urgent: -3, cat: { work: 2, nope: 9 }, lastQuestDay: 'x' })).toMatchObject({ done: 12, urgent: 0, lastQuestDay: null, cat: { work: 2, personal: 0 } });
    const s: TodoStats = { xp: 650, counters: { ...emptyCounters(), done: 55, bestStreak: 2, cat: { personal: 1, work: 3, learning: 1, health: 1 } } };
    const a = Object.fromEntries(achievements(s).map((x) => [x.id, x]));
    expect(a.finisher).toMatchObject({ tier: 2, next: 200 });
    expect(a.onFire).toMatchObject({ tier: 0, next: 3 });
    expect(a.climber).toMatchObject({ tier: 1, value: 4 });
    expect(a.balanced).toMatchObject({ tier: 1, value: 1 });
  });
});
