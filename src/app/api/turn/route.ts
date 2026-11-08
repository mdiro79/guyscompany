import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { iceConfig } from '@/lib/realtime/ice';

export const dynamic = 'force-dynamic';

// TURN settings stay in private server variables (see src/lib/realtime/ice.ts) and are handed only to
// signed-in browsers, so no NEXT_PUBLIC_ variable is needed. `ttl` (seconds) tells the browser when
// to ask again; null means the credentials do not expire.
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  if (!(await currentUserId())) return NextResponse.json({ servers: [], ttl: null, source: 'none' }, { headers });
  return NextResponse.json(await iceConfig(), { headers });
}
