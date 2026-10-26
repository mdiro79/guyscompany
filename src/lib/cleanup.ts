import 'server-only';
import { store } from '@/lib/data';
import { runningMeeting } from '@/lib/meetings-server';
import { VISIT_RETENTION_DAYS, READ_NOTIFICATION_RETENTION_DAYS, CLEARED_TODO_RETENTION_DAYS } from '@/lib/limits';

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export async function runCleanup() {
  // A meeting nobody ended (everyone just left) is closed when the last person left.
  await runningMeeting();
  return store().purge(daysAgo(VISIT_RETENTION_DAYS), daysAgo(READ_NOTIFICATION_RETENTION_DAYS), daysAgo(CLEARED_TODO_RETENTION_DAYS));
}
