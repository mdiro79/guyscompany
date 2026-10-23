import { NextResponse } from 'next/server';
import { runCleanup } from '@/lib/cleanup';
import { store } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Daily Vercel Cron: removes old visits/notifications and keeps the free Supabase project awake.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const removed = await runCleanup();
  await store().listOffices();
  return NextResponse.json({ ok: true, removed });
}
