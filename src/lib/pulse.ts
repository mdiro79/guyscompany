import type { Post } from '@/lib/data/types';

// Small sums over the team pulse posts (see PulseView and the insights page).

/** Days in a row, ending today or yesterday, on which the member posted a standup. */
export function standupStreak(posts: Post[], userId: string, today: string) {
  const days = new Set(posts.filter((p) => p.kind === 'standup' && p.authorId === userId && p.day).map((p) => p.day!));
  const step = (iso: string, by: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
  let day = days.has(today) ? today : step(today, -1);
  let n = 0;
  while (days.has(day)) { n += 1; day = step(day, -1); }
  return n;
}

/** Kudos received per member, most first. */
export function kudosBoard(posts: Post[], memberIds: string[]) {
  return memberIds.map((id) => ({ id, received: posts.filter((p) => p.kind === 'kudos' && p.targetId === id).length, given: posts.filter((p) => p.kind === 'kudos' && p.authorId === id).length }))
    .sort((a, b) => b.received - a.received || b.given - a.given);
}

/** Announcements with the pinned ones first, each group newest first. */
export const announcements = (posts: Post[]) => posts.filter((p) => p.kind === 'announcement').sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
