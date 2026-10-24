import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

// Runs supabase-setup.sql on PGlite with minimal stand-ins for Supabase's auth/storage/realtime objects.
it('supabase-setup.sql applies cleanly after the migration', async () => {
  const pg = new PGlite();
  await pg.exec(`
    create role authenticated;
    create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    create publication supabase_realtime;
  `);
  const dir = path.resolve(__dirname, '../../../drizzle');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(path.join(dir, f), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pg.exec(stmt);
  }
  const setup = readFileSync(path.resolve(__dirname, '../../../supabase-setup.sql'), 'utf8');
  await pg.exec(setup);
  await pg.exec(setup); // idempotent: runs on every deploy
  const offices = await pg.query<{ n: number }>('select count(*)::int as n from offices');
  expect(offices.rows[0].n).toBe(4);
  const policies = await pg.query<{ n: number }>('select count(*)::int as n from pg_policies');
  expect(policies.rows[0].n).toBe(24);
  const rooms = await pg.query<{ id: string; light: number; frost: number }>('select id, light, frost from rooms');
  expect(rooms.rows).toEqual([{ id: 'conference', light: 100, frost: 0 }]);
  const realtime = await pg.query<{ n: number }>("select count(*)::int as n from pg_publication_tables where tablename = 'todos'");
  expect(realtime.rows[0].n).toBe(1);
});
