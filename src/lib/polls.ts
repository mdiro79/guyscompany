import type { Poll, PollVote } from '@/lib/data/types';

export interface PollSummary {
  isClosed: boolean;
  voteCount: number;
  myScore: number | null;
  // Only revealed once the poll is closed.
  average: number | null;
}

export function isPollClosed(poll: Poll, now = Date.now()) {
  return poll.closed || new Date(poll.closesAt).getTime() <= now;
}

export function summarizePoll(poll: Poll, votes: PollVote[], userId: string, now = Date.now()): PollSummary {
  const mine = votes.filter((v) => v.pollId === poll.id);
  const isClosed = isPollClosed(poll, now);
  const average = isClosed && mine.length ? mine.reduce((s, v) => s + v.score, 0) / mine.length : null;
  return {
    isClosed,
    voteCount: mine.length,
    myScore: mine.find((v) => v.userId === userId)?.score ?? null,
    average: average === null ? null : Math.round(average * 10) / 10,
  };
}

// Ranks closed polls by average; a tie for first place is left to the project manager.
export function rankClosedPolls(polls: Poll[], votes: PollVote[], now = Date.now()) {
  const ranked = polls
    .filter((p) => isPollClosed(p, now))
    .map((p) => ({ poll: p, average: summarizePoll(p, votes, '', now).average ?? 0 }))
    .sort((a, b) => b.average - a.average);
  const tie = ranked.length > 1 && ranked[0].average === ranked[1].average;
  return { ranked, tie };
}

export const isValidScore = (n: number) => Number.isInteger(n) && n >= 1 && n <= 10;

// Strips other members' scores from open polls before data reaches the browser (count stays visible).
export function redactVotes(polls: Poll[], votes: PollVote[], userId: string, now = Date.now()): PollVote[] {
  const open = new Set(polls.filter((p) => !isPollClosed(p, now)).map((p) => p.id));
  return votes.map((v) => (open.has(v.pollId) && v.userId !== userId ? { ...v, userId: '', score: 0 } : v));
}
