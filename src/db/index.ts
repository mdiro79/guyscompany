import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { serverEnv } from '@/lib/env';

type Client = ReturnType<typeof postgres>;
const g = globalThis as unknown as { pg?: Client; db?: ReturnType<typeof drizzle<typeof schema>>; lastUse?: number; gen?: number };

// Serverless instances are frozen between requests and a socket kept across a long freeze can be dead.
// Connections are reused while requests keep coming (no new TLS handshake per page) and replaced after
// a quiet period; a failed or hung query is retried once on a fresh connection (see db-store).
const STALE_MS = 15_000;

export function getDb() {
  const url = serverEnv().databaseUrl;
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL from the Supabase integration) is not set');
  const now = Date.now();
  if (g.pg && g.lastUse && now - g.lastUse > STALE_MS) resetDb();
  g.lastUse = now;
  if (!g.pg) {
    // prepare: false is required by the Supabase transaction pooler. Several connections let a page's
    // parallel queries run at once instead of queueing behind each other.
    g.pg = postgres(url, { prepare: false, max: 6, connect_timeout: 8, idle_timeout: 10, max_lifetime: 300, onnotice: () => {} });
    g.db = drizzle(g.pg, { schema });
    g.gen = (g.gen ?? 0) + 1;
  }
  return g.db!;
}

// Identifies the current set of connections, so parallel failures replace it only once.
export const dbGeneration = () => g.gen ?? 0;

// Drops the current connections (only if they are still generation `onlyGen`, when given);
// in-flight queries get a few seconds to finish.
export function resetDb(timeoutSeconds = 3, onlyGen?: number) {
  if (onlyGen !== undefined && onlyGen !== g.gen) return;
  const old = g.pg;
  g.pg = undefined;
  g.db = undefined;
  if (old) void old.end({ timeout: timeoutSeconds }).catch(() => {});
}

export { schema };
