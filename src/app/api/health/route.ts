import { NextResponse } from 'next/server';
import { isDemo, env, serverEnv } from '@/lib/env';
import { store } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Post-deploy check: which settings are present (never their values) and whether the database answers.
export async function GET() {
  const config = {
    supabaseUrl: !!env.supabaseUrl,
    anonKey: !!env.supabaseAnonKey,
    serviceRoleKey: !!serverEnv().serviceRoleKey,
    databaseUrl: !!serverEnv().databaseUrl,
    cronSecret: !!process.env.CRON_SECRET,
    turn: !!process.env.NEXT_PUBLIC_TURN_URLS,
  };
  let database: 'ok' | 'error' = 'ok';
  let offices = 0;
  try { offices = (await store().listOffices()).length; } catch { database = 'error'; }
  const ok = database === 'ok' && (isDemo || (config.serviceRoleKey && config.databaseUrl && offices === 4));
  return NextResponse.json({ ok, mode: isDemo ? 'demo' : 'supabase', config, database, offices }, { status: ok ? 200 : 500 });
}
