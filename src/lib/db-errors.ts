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

// Connection-level failures that are safe to retry on a fresh connection.
export const isConnectionError = (e: unknown) => NETWORK.has(describeDbError(e).code);
