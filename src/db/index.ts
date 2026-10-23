import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { serverEnv } from '@/lib/env';

type Client = ReturnType<typeof postgres>;
const g = globalThis as unknown as { pg?: Client; db?: ReturnType<typeof drizzle<typeof schema>>; lastUse?: number };

// Serverless instances are frozen between requests; a socket kept across a freeze can hang the next query.
// After a few idle seconds the connection is replaced (the Supabase pooler makes new connections cheap).
const STALE_MS = 4000;

export function getDb() {
  const url = serverEnv().databaseUrl;
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL from the Supabase integration) is not set');
  const now = Date.now();
  if (g.pg && g.lastUse && now - g.lastUse > STALE_MS) {
    void g.pg.end({ timeout: 5 }).catch(() => {}); // lets in-flight queries finish
    g.pg = undefined;
    g.db = undefined;
  }
  g.lastUse = now;
  if (!g.pg) {
    // prepare: false is required by the Supabase transaction pooler.
    g.pg = postgres(url, { prepare: false, max: 3, connect_timeout: 10, idle_timeout: 3, max_lifetime: 60, onnotice: () => {} });
    g.db = drizzle(g.pg, { schema });
  }
  return g.db!;
}

export { schema };
