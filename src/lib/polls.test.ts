import { describe, it, expect } from 'vitest';
import { summarizePoll, rankClosedPolls, isValidScore } from './polls';
import type { Poll } from './data/types';

const poll = (id: string, closesInMs: number, closed = false): Poll => ({
  id, question: 'q', taskId: null, createdBy: null, closesAt: new Date(Date.now() + closesInMs).toISOString(), closed, decision: null, createdAt: '',
});

describe('polls', () => {
  it('hides the average while open', () => {
    const s = summarizePoll(poll('a', 60000), [{ pollId: 'a', userId: 'u', score: 7 }], 'u');
    expect(s.isClosed).toBe(false);
    expect(s.average).toBeNull();
    expect(s.myScore).toBe(7);
    expect(s.voteCount).toBe(1);
  });
  it('reveals the average after the deadline', () => {
    const s = summarizePoll(poll('a', -1), [{ pollId: 'a', userId: 'u', score: 7 }, { pollId: 'a', userId: 'v', score: 4 }], 'x');
    expect(s.isClosed).toBe(true);
    expect(s.average).toBe(5.5);
  });
  it('detects ties for first place', () => {
    const votes = [{ pollId: 'a', userId: 'u', score: 8 }, { pollId: 'b', userId: 'u', score: 8 }, { pollId: 'c', userId: 'u', score: 3 }];
    const r = rankClosedPolls([poll('a', -1), poll('b', 0, true), poll('c', -1)], votes);
    expect(r.tie).toBe(true);
    expect(r.ranked.at(-1)?.poll.id).toBe('c');
  });
  it('validates scores 1..10', () => {
    expect(isValidScore(1)).toBe(true);
    expect(isValidScore(10)).toBe(true);
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(5.5)).toBe(false);
  });
});

describe('redactVotes', () => {
  it('hides other scores on open polls only', async () => {
    const { redactVotes } = await import('./polls');
    const votes = [{ pollId: 'a', userId: 'u', score: 7 }, { pollId: 'a', userId: 'v', score: 3 }, { pollId: 'b', userId: 'v', score: 9 }];
    const r = redactVotes([poll('a', 60000), poll('b', -1)], votes, 'u');
    expect(r[0].score).toBe(7);
    expect(r[1]).toEqual({ pollId: 'a', userId: '', score: 0 });
    expect(r[2].score).toBe(9);
  });
});
