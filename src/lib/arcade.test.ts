import { describe, it, expect } from 'vitest';
import { applyDelta, league, ranking, scoreDelta, type GameScore } from './arcade';

const row = (userId: string, game: string, best: number, plays = 1, wins = 0, updatedAt = '2026-01-01'): GameScore => ({ userId, game, best, plays, wins, updatedAt });

describe('game room records', () => {
  it('accepts only reports that fit the game', () => {
    expect(scoreDelta('serpent', { score: 12.9 })).toEqual({ score: 12, points: 0, wins: 0 });
    expect(scoreDelta('serpent', { score: 5, won: true })).toEqual({ score: 5, points: 0, wins: 1 });
    expect(scoreDelta('serpent', { score: -1 })).toBeNull();
    expect(scoreDelta('serpent', { score: 1e9 })).toBeNull();
    expect(scoreDelta('serpent', { score: NaN })).toBeNull();
    expect(scoreDelta('serpent', { outcome: 'win', vs: 'bot' })).toBeNull();
    expect(scoreDelta('four', { score: 10 })).toBeNull();
    expect(scoreDelta('four', { outcome: 'win', vs: 'human' })).toEqual({ score: 0, points: 3, wins: 1 });
    expect(scoreDelta('four', { outcome: 'win', vs: 'bot' })).toEqual({ score: 0, points: 1, wins: 1 });
    expect(scoreDelta('four', { outcome: 'draw', vs: 'human' })).toEqual({ score: 0, points: 1, wins: 0 });
    expect(scoreDelta('four', { outcome: 'draw', vs: 'bot' })).toEqual({ score: 0, points: 0, wins: 0 });
    expect(scoreDelta('four', { outcome: 'loss', vs: 'human' })).toEqual({ score: 0, points: 0, wins: 0 });
    expect(scoreDelta('four', { outcome: 'cheat' as never, vs: 'human' })).toBeNull();
  });
  it('keeps the best score and adds league points', () => {
    expect(applyDelta(undefined, { score: 30, points: 0, wins: 0 })).toEqual({ best: 30, plays: 1, wins: 0 });
    expect(applyDelta({ best: 30, plays: 1, wins: 0 }, { score: 10, points: 0, wins: 1 })).toEqual({ best: 30, plays: 2, wins: 1 });
    expect(applyDelta({ best: 4, plays: 2, wins: 2 }, { score: 0, points: 3, wins: 1 })).toEqual({ best: 7, plays: 3, wins: 3 });
  });
  it('ranks a game with shared places', () => {
    const r = ranking([row('a', 'gems', 50), row('b', 'gems', 80), row('c', 'gems', 50), row('d', 'gems', 0), row('a', 'four', 9)], 'gems');
    expect(r.map((x) => [x.userId, x.place])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
  });
  it('builds the league from places in every game', () => {
    const scores = [row('a', 'gems', 50, 4), row('b', 'gems', 80, 2), row('a', 'four', 9, 3, 3), row('b', 'four', 3, 3, 1), row('c', 'stack', 7), row('x', 'nope', 99)];
    const l = league(scores, ['a', 'b', 'c', 'd']);
    expect(l.map((x) => x.userId)).toEqual(['a', 'b', 'c', 'd']);
    expect(l[0]).toMatchObject({ points: 8, gold: 1, silver: 1, plays: 7, wins: 3, place: 1 });
    expect(l[1]).toMatchObject({ points: 8, gold: 1, silver: 1, place: 1 });
    expect(l[2]).toMatchObject({ points: 5, gold: 1, place: 3 });
    expect(l[3]).toMatchObject({ points: 0, place: 4 });
  });
});
