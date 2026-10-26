import type { Meeting, MeetingAttendance } from '@/lib/data/types';

// Meeting attendance worked out from stays in the conference room. A member's tab joins when they enter
// the room, leaves when they go, and confirms "still here" every HEARTBEAT_MS; a stay that stops being
// confirmed (tab closed, phone asleep) ends shortly after its last confirmation instead of running on.
// A meeting nobody has been in for MEETING_IDLE_MS is over, ended when the last person left.

export const MEETING_TITLE_MAX = 80;
export const MEETING_PURPOSE_MAX = 400;
export const NOTE_MAX = 2000;
export const SHARED_TITLE_MAX = 120;
export const SHARED_BODY_MAX = 4000;
export const HEARTBEAT_MS = 2 * 60_000;
const GRACE_MS = 30_000;
export const MEETING_IDLE_MS = 15 * 60_000;

const t = (iso: string) => Date.parse(iso);
const isoAt = (ms: number) => new Date(ms).toISOString();

/** The latest moment an open stay can count to: `at`, but no later than just after its last confirmation. */
export const stayEnd = (a: MeetingAttendance, at: number) => Math.min(at, t(a.seenAt) + HEARTBEAT_MS + GRACE_MS);

/** Whether the member is in the room now (an open, recently confirmed stay). */
export const inRoom = (a: MeetingAttendance, now: number) => !!a.joinedAt && stayEnd(a, now) >= now;

/** Seconds in the meeting up to `at` (now, or when it ended). */
export function attendedSeconds(a: MeetingAttendance, at: number) {
  if (!a.joinedAt) return a.seconds;
  return a.seconds + Math.max(0, Math.round((stayEnd(a, at) - t(a.joinedAt)) / 1000));
}

/** Ends the open stay (leaving the room, or the meeting ending at `at`). */
export function leave(a: MeetingAttendance, at: number): MeetingAttendance {
  if (!a.joinedAt) return a;
  return { ...a, seconds: attendedSeconds(a, at), joinedAt: null, seenAt: isoAt(Math.max(t(a.seenAt), Math.min(at, stayEnd(a, at)))) };
}

/** Entering the room (or confirming one is still there): a stale open stay is closed first. */
export function join(a: MeetingAttendance | null, meetingId: string, userId: string, now: number): MeetingAttendance {
  if (!a) return { meetingId, userId, firstJoinedAt: isoAt(now), joinedAt: isoAt(now), seenAt: isoAt(now), seconds: 0 };
  const open = a.joinedAt && inRoom(a, now) ? a : leave(a, now);
  return { ...open, joinedAt: open.joinedAt ?? isoAt(now), seenAt: isoAt(now) };
}

/**
 * When the meeting ended: its end time, or (nobody in the room for MEETING_IDLE_MS) when the last person
 * left; null while it runs.
 */
export function meetingEnd(m: Meeting, attendance: MeetingAttendance[], now: number): number | null {
  if (m.endedAt) return t(m.endedAt);
  const mine = attendance.filter((a) => a.meetingId === m.id);
  if (mine.some((a) => inRoom(a, now))) return null;
  const last = Math.max(t(m.startedAt), ...mine.map((a) => (a.joinedAt ? stayEnd(a, now) : t(a.seenAt))));
  return now - last >= MEETING_IDLE_MS ? last : null;
}

/** How long the meeting ran (so far). */
export const meetingSeconds = (m: Meeting, attendance: MeetingAttendance[], now: number) =>
  Math.max(0, Math.round(((meetingEnd(m, attendance, now) ?? now) - t(m.startedAt)) / 1000));

/** "1:05:09" or "12:04" */
export function clockText(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
