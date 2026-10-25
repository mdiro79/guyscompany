import { NextResponse } from 'next/server';
import { isDemo, env, serverEnv, configProblems, databaseRegion } from '@/lib/env';
import { describeDbError } from '@/lib/db-errors';
import { store } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Post-deploy check: which settings are present (never their values), whether the database answers,
// how long it takes, and whether the function runs in the database's region.
export async function GET() {
  const s = serverEnv();
  const config = {
    supabaseUrl: !!env.supabaseUrl,
    anonKey: !!env.supabaseAnonKey,
    serviceRoleKey: !!s.serviceRoleKey,
    databaseUrl: !!s.databaseUrl,
    jwtSecret: !!s.jwtSecret,
    cronSecret: !!process.env.CRON_SECRET,
    turn: !!process.env.NEXT_PUBLIC_TURN_URLS,
    adminFromEnv: !!process.env.ADMIN_USERNAME,
  };
  const missing = configProblems();
  let database: { ok: boolean; ms?: number; offices?: number; profiles?: number; error?: ReturnType<typeof describeDbError> } = { ok: false };
  if (!missing.length) {
    const t0 = Date.now();
    try {
      const [offices, profiles] = await Promise.all([store().listOffices(), store().listProfiles()]);
      database = { ok: offices.length === 4, ms: Date.now() - t0, offices: offices.length, profiles: profiles.length };
    } catch (e) {
      database = { ok: false, ms: Date.now() - t0, error: describeDbError(e) };
    }
  }
  const db = isDemo ? null : databaseRegion();
  const regions = { function: process.env.VERCEL_REGION ?? null, database: db?.aws ?? null, suggestedFunctionRegion: db?.vercel ?? null };
  const ok = database.ok && !missing.length;
  return NextResponse.json(
    { ok, mode: isDemo ? 'demo' : 'supabase', missing, config, database, regions, needsSetup: database.profiles === 0 },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
