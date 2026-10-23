import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // prepare: false is required by the Supabase transaction pooler.
  globalForDb.pg ??= postgres(url, { prepare: false, max: 1 });
  return drizzle(globalForDb.pg, { schema });
}

export { schema };
