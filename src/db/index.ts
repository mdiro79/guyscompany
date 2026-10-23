import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { serverEnv } from '@/lib/env';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

export function getDb() {
  const url = serverEnv().databaseUrl;
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL from the Supabase integration) is not set');
  // prepare: false is required by the Supabase transaction pooler.
  globalForDb.pg ??= postgres(url, { prepare: false, max: 1 });
  return drizzle(globalForDb.pg, { schema });
}

export { schema };
