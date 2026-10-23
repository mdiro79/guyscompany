// Runs before `next build` (npm run build). With a database configured (Vercel ↔ Supabase integration
// sets POSTGRES_URL / POSTGRES_URL_NON_POOLING), it applies the Drizzle migrations and supabase-setup.sql.
// Without one it does nothing, and the app builds in demo mode.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const clean = (url) => {
  if (!url) return '';
  try { const u = new URL(url); const ssl = u.searchParams.get('sslmode'); u.search = ssl ? `?sslmode=${ssl}` : ''; return u.toString(); } catch { return url; }
};
const url = clean(process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL);

if (!url) {
  console.log('[db-setup] No database configured: building in demo mode.');
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
  console.log('[db-setup] Migrations applied.');
  await sql.unsafe(readFileSync('supabase-setup.sql', 'utf8'));
  console.log('[db-setup] RLS, realtime, office slots and storage bucket are set up.');
} catch (e) {
  console.error('[db-setup] Failed:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
