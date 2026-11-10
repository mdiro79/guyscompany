import { describe, it, expect } from 'vitest';
import type { Post } from '@/lib/data/types';
import { announcements, kudosBoard, standupStreak } from './pulse';

const post = (o: Partial<Post>): Post => ({ id: Math.random().toString(), kind: 'standup', authorId: 'a', targetId: null, body: '', did: '', blockers: '', badge: '', pinned: false, day: null, createdAt: '2026-11-10T08:00:00.000Z', ...o });

describe('team pulse', () => {
  it('counts a standup streak that ends today or yesterday', () => {
    const posts = ['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-05'].map((day) => post({ day }));
    expect(standupStreak(posts, 'a', '2026-11-10')).toBe(3);
    expect(standupStreak(posts, 'a', '2026-11-11')).toBe(3); // today not posted yet
    expect(standupStreak(posts, 'a', '2026-11-12')).toBe(0);
    expect(standupStreak(posts, 'b', '2026-11-10')).toBe(0);
    expect(standupStreak([post({ day: '2026-03-01' }), post({ day: '2026-02-28' })], 'a', '2026-03-01')).toBe(2); // across a month end
  });
  it('ranks kudos by received, then given', () => {
    const posts = [post({ kind: 'kudos', authorId: 'a', targetId: 'b' }), post({ kind: 'kudos', authorId: 'c', targetId: 'b' }), post({ kind: 'kudos', authorId: 'b', targetId: 'a' })];
    expect(kudosBoard(posts, ['a', 'b', 'c'])).toEqual([{ id: 'b', received: 2, given: 1 }, { id: 'a', received: 1, given: 1 }, { id: 'c', received: 0, given: 1 }]);
  });
  it('lists pinned announcements first, newest first within each group', () => {
    const list = announcements([
      post({ kind: 'announcement', body: 'old', createdAt: '2026-11-01T00:00:00.000Z' }), post({ kind: 'announcement', body: 'new', createdAt: '2026-11-09T00:00:00.000Z' }),
      post({ kind: 'announcement', body: 'pinned', pinned: true, createdAt: '2026-10-01T00:00:00.000Z' }), post({ kind: 'kudos' }),
    ]);
    expect(list.map((p) => p.body)).toEqual(['pinned', 'new', 'old']);
  });
});
