import { describe, expect, it } from 'vitest';
import type { Meeting } from '@/lib/data/types';
import { attendedSeconds, clockText, HEARTBEAT_MS, inRoom, join, leave, meetingEnd, meetingSeconds, MEETING_IDLE_MS } from './meetings';

const T0 = Date.parse('2026-10-26T10:00:00Z');
const min = (n: number) => T0 + n * 60_000;
const meeting: Meeting = { id: 'm', title: 'Weekly', purpose: '', projectId: null, startedBy: 'a', startedAt: new Date(T0).toISOString(), endedAt: null };

describe('meeting attendance', () => {
  it('adds up stays in the room', () => {
    let a = join(null, 'm', 'a', min(0));
    expect(inRoom(a, min(1))).toBe(true);
    a = join(a, 'm', 'a', min(2)); // still here
    a = leave(a, min(3));
    expect(a.seconds).toBe(180);
    expect(inRoom(a, min(3))).toBe(false);
    a = join(a, 'm', 'a', min(10));
    expect(a.firstJoinedAt).toBe(new Date(T0).toISOString());
    expect(attendedSeconds(a, min(11))).toBe(240);
  });

  it('stops counting a stay that is no longer confirmed (closed tab)', () => {
    const a = join(null, 'm', 'a', min(0));
    const cap = (HEARTBEAT_MS + 30_000) / 1000;
    expect(attendedSeconds(a, min(60))).toBe(cap);
    expect(inRoom(a, min(60))).toBe(false);
    // Coming back later starts a new stay; the stale one keeps only its confirmed part.
    const back = join(a, 'm', 'a', min(60));
    expect(back.seconds).toBe(cap);
    expect(back.joinedAt).toBe(new Date(min(60)).toISOString());
  });

  it('ends a meeting nobody has been in for a while, when the last person left', () => {
    let stay = join(null, 'm', 'a', min(0));
    for (let k = 2; k <= 18; k += 2) stay = join(stay, 'm', 'a', min(k)); // "still here" every 2 minutes
    const a = leave(stay, min(20));
    expect(a.seconds).toBe(20 * 60);
    expect(meetingEnd(meeting, [a], min(25))).toBeNull();
    expect(meetingEnd(meeting, [a], min(20) + MEETING_IDLE_MS)).toBe(min(20));
    expect(meetingSeconds(meeting, [a], min(90))).toBe(20 * 60);
    expect(meetingEnd({ ...meeting, endedAt: new Date(min(5)).toISOString() }, [a], min(90))).toBe(min(5));
    expect(meetingEnd(meeting, [join(null, 'm', 'b', min(89))], min(90))).toBeNull();
  });

  it('formats durations', () => {
    expect(clockText(65)).toBe('1:05');
    expect(clockText(3909)).toBe('1:05:09');
  });
});
