export type DbHint = 'tables' | 'auth' | 'paused' | 'network' | 'config' | 'unknown';

const NETWORK = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
  'CONNECT_TIMEOUT', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED', 'QUERY_TIMEOUT']);

// Maps a database error to a short code and a hint the setup screen can explain (no secrets are exposed).
export function describeDbError(e: unknown): { code: string; hint: DbHint } {
  const err = e as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown } | null;
  if (err?.cause && !err.code) return describeDbError(err.cause);
  const code = typeof err?.code === 'string' ? err.code : typeof err?.errno === 'string' ? err.errno : 'UNKNOWN';
  const message = typeof err?.message === 'string' ? err.message : '';
  if (code === '42P01' || code === '42704' || code === '3F000') return { code, hint: 'tables' };
  if (code === '28P01' || code === '28000') return { code, hint: 'auth' };
  if (/tenant or user not found|project.*paused/i.test(message)) return { code, hint: 'paused' };
  if (NETWORK.has(code)) return { code, hint: 'network' };
  if (/DATABASE_URL|POSTGRES_URL/.test(message)) return { code: 'NO_DATABASE_URL', hint: 'config' };
  return { code, hint: 'unknown' };
}

// Server-side refusals of the Supabase pooler or Postgres while connecting or under load:
// too many connections, server starting or shutting down, a pooler handler that exited.
const BUSY_CODES = new Set(['53300', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006']);
const BUSY_MESSAGE = /max ?client|too many (clients|connections)|EDBHANDLEREXITED|connection (terminated|closed)|server closed the connection|pool.*(timeout|exhausted)/i;
// Failures before anything was sent to the database, so even a write can be repeated safely.
const NOT_SENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'CONNECT_TIMEOUT', '53300', '57P03', '08001', '08004']);

const messageOf = (e: unknown): string => {
  const err = e as { message?: unknown; cause?: unknown } | null;
  return `${typeof err?.message === 'string' ? err.message : ''} ${err?.cause ? messageOf(err.cause) : ''}`;
};

// Connection-level failures that are safe to retry on a fresh connection.
export const isConnectionError = (e: unknown) => {
  const { code } = describeDbError(e);
  return NETWORK.has(code) || BUSY_CODES.has(code) || BUSY_MESSAGE.test(messageOf(e));
};

// Connection failures where the query certainly never reached the database (safe to retry writes).
export const isNotSentError = (e: unknown) => NOT_SENT.has(describeDbError(e).code) || /max ?client|too many (clients|connections)/i.test(messageOf(e));
