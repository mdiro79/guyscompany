import { NextResponse, type NextRequest } from 'next/server';
import { turnConfigured } from '@/lib/turn';

export const dynamic = 'force-dynamic';

// Relay (TURN) settings for the voice/position mesh, handed only to signed-in browsers.
// Preferred: Cloudflare Realtime TURN (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN): short-lived
// credentials are generated per request, so the long-lived token never reaches a browser.
// Fallback: a fixed TURN server (TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL).

const CREDENTIAL_TTL_S = 24 * 60 * 60;

type IceServer = { urls: string | string[]; username?: string; credential?: string };

// Port 53 addresses are blocked by browsers and only make ICE gathering wait, so they are left out.
function withoutPort53(servers: IceServer[]): IceServer[] {
  return servers
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
}

async function cloudflareServers(): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID!;
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: CREDENTIAL_TTL_S }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`cloudflare turn ${res.status}`);
  const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  return withoutPort53(list);
}

function staticServers(): IceServer[] {
  const urls = process.env.TURN_URLS ?? process.env.NEXT_PUBLIC_TURN_URLS ?? '';
  return [{
    urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME ?? process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL ?? process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }];
}

export async function GET(request: NextRequest) {
  const headers = { 'cache-control': 'no-store' };
  const signedIn = request.cookies.getAll().some((c) => c.name.startsWith('sb-') || c.name === 'gc_demo_session');
  const kind = turnConfigured();
  if (!signedIn || !kind) return NextResponse.json({ servers: [] }, { headers });
  if (kind === 'cloudflare') {
    try {
      return NextResponse.json({ servers: await cloudflareServers(), ttl: CREDENTIAL_TTL_S }, { headers });
    } catch (e) {
      console.error('[turn] cloudflare credentials failed:', e instanceof Error ? e.message : e);
      // A fixed server, if one is also set, still helps; otherwise the browser falls back to STUN only.
      if (process.env.TURN_URLS ?? process.env.NEXT_PUBLIC_TURN_URLS) return NextResponse.json({ servers: staticServers() }, { headers });
      return NextResponse.json({ servers: [], error: 'turn_unavailable' }, { headers });
    }
  }
  return NextResponse.json({ servers: staticServers() }, { headers });
}
