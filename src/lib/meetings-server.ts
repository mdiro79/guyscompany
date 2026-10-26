import 'server-only';
import { store, type Meeting } from '@/lib/data';
import { leave, meetingEnd } from '@/lib/meetings';

/** Ends a meeting at `at`, closing every stay still open. */
export async function finishMeeting(m: Meeting, at: number) {
  await store().updateMeeting(m.id, { endedAt: new Date(at).toISOString() });
  for (const a of await store().listAttendance([m.id])) if (a.joinedAt) await store().setAttendance(leave(a, at));
}

/** The meeting running now; one left behind with nobody in the room is ended (when the last person left). */
export async function runningMeeting() {
  const m = await store().getOpenMeeting();
  if (!m) return null;
  const end = meetingEnd(m, await store().listAttendance([m.id]), Date.now());
  if (end === null) return m;
  await finishMeeting(m, end);
  return null;
}
