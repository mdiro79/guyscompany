// Runs before `next build` (npm run build). With a database configured (Vercel ↔ Supabase integration
// sets POSTGRES_URL / POSTGRES_URL_NON_POOLING), it applies the Drizzle migrations and supabase-setup.sql.
// Without one it does nothing, and the app builds in demo mode.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const clean = (url) => {
  if (!url) return '';
  try { const u = new URL(url); const ssl = u.searchParams.get('sslmode'); u.search = ssl ? `?sslmode=${ssl}` : ''; return u.toString(); } catch { return url; }
};
const url = clean(process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

if (!url) {
  if (supabaseUrl) {
    console.warn('[db-setup] WARNING: Supabase is configured but no database URL (POSTGRES_URL / DATABASE_URL) is set.');
    console.warn('[db-setup] The site will show a setup notice until the Supabase integration is connected to this environment.');
  } else {
    console.log('[db-setup] No database configured: building in demo mode.');
  }
  process.exit(0);
}

// Function region vs database region: a mismatch adds a round trip across the world to every query.
const region = /aws-\d+-([a-z]+-[a-z]+-\d)\./.exec(clean(process.env.POSTGRES_URL || process.env.DATABASE_URL || ''))?.[1];
if (region) console.log(`[db-setup] Supabase region: ${region}. Set Vercel → Settings → Functions → Region to the closest one (see docs/DEPLOY.md).`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
    console.log('[db-setup] Migrations applied.');
    // The setup SQL (policies, realtime, slots) only runs when it changed: re-running it on every build
    // waited on locks held by the live app and hit the statement timeout, making builds take minutes.
    const setupSql = readFileSync('supabase-setup.sql', 'utf8');
    const hash = createHash('sha256').update(setupSql).digest('hex');
    await sql`create table if not exists public._gc_setup (id int primary key, hash text not null)`;
    await sql`alter table public._gc_setup enable row level security`;
    const [row] = await sql`select hash from public._gc_setup where id = 1`;
    if (row?.hash === hash) {
      console.log('[db-setup] RLS, realtime, office slots and storage bucket already up to date.');
      return;
    }
    await sql.unsafe("set statement_timeout = 0; set lock_timeout = '30s';");
    await sql.unsafe(setupSql);
    await sql`insert into public._gc_setup (id, hash) values (1, ${hash}) on conflict (id) do update set hash = excluded.hash`;
    console.log('[db-setup] RLS, realtime, office slots and storage bucket are set up.');
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

// A paused or just-created Supabase project can take a moment to accept connections.
for (let attempt = 1; ; attempt++) {
  try {
    await setup();
    break;
  } catch (e) {
    console.error(`[db-setup] Attempt ${attempt} failed: ${e.code ?? ''} ${e.message}`);
    if (attempt >= 3) {
      console.error('[db-setup] Could not set up the database. Check that the Supabase project is active (not paused) and redeploy.');
      process.exit(1);
    }
    await sleep(attempt * 5000);
  }
}
