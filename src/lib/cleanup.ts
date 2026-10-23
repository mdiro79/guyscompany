import 'server-only';
import { store } from '@/lib/data';
import { VISIT_RETENTION_DAYS, READ_NOTIFICATION_RETENTION_DAYS, CLEARED_TODO_RETENTION_DAYS } from '@/lib/limits';

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export function runCleanup() {
  return store().purge(daysAgo(VISIT_RETENTION_DAYS), daysAgo(READ_NOTIFICATION_RETENTION_DAYS), daysAgo(CLEARED_TODO_RETENTION_DAYS));
}
