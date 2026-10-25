import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// TURN settings stay in private server variables (TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL) and are
// handed only to signed-in browsers, so no NEXT_PUBLIC_ variable is needed.
export function GET(request: NextRequest) {
  const signedIn = request.cookies.getAll().some((c) => c.name.startsWith('sb-') || c.name === 'gc_demo_session');
  const urls = process.env.TURN_URLS ?? process.env.NEXT_PUBLIC_TURN_URLS;
  if (!signedIn || !urls) return NextResponse.json({ servers: [] }, { headers: { 'cache-control': 'no-store' } });
  const servers = [{
    urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME ?? process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL ?? process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }];
  return NextResponse.json({ servers }, { headers: { 'cache-control': 'no-store' } });
}
