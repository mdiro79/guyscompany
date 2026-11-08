import 'server-only';

// TURN relay settings for the WebRTC mesh. Without TURN, two people behind different home or mobile
// networks (carrier NAT) usually cannot open a direct link, so they never see or hear each other.
//
// Two ways to configure it, both private server variables:
// - Cloudflare Realtime TURN (free up to 1000 GB a month): CLOUDFLARE_TURN_KEY_ID and
//   CLOUDFLARE_TURN_API_TOKEN. Short-lived credentials are generated here and cached.
// - Any other provider with fixed credentials: TURN_URLS (comma separated), TURN_USERNAME, TURN_CREDENTIAL.

export interface IceServer { urls: string[]; username?: string; credential?: string }
export interface IceConfig { servers: IceServer[]; ttl: number | null; source: 'cloudflare' | 'static' | 'none' }

const CF_TTL_S = 86_400; // credentials live a day…
const CF_REUSE_MS = 12 * 60 * 60 * 1000; // …and are handed out for half of it, so every copy stays valid 12 h or more

// Browsers refuse port 53 for TURN/STUN, and those entries only slow down candidate gathering.
const usable = (url: string) => !/:53(\?|$)/.test(url);

/** Normalises Cloudflare's answer (`iceServers` as a list, or a single object in the older API). */
export function parseCloudflareIce(body: unknown): IceServer[] {
  const raw = (body as { iceServers?: unknown } | null)?.iceServers;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: IceServer[] = [];
  for (const s of list as { urls?: unknown; username?: unknown; credential?: unknown }[]) {
    const urls = (Array.isArray(s?.urls) ? s.urls : typeof s?.urls === 'string' ? [s.urls] : []).filter((u): u is string => typeof u === 'string' && usable(u));
    if (!urls.length) continue;
    out.push({ urls, ...(typeof s.username === 'string' ? { username: s.username } : {}), ...(typeof s.credential === 'string' ? { credential: s.credential } : {}) });
  }
  return out;
}

type Env = Record<string, string | undefined>;

export function staticIce(e: Env = process.env): IceServer[] {
  const urls = (e.TURN_URLS ?? e.NEXT_PUBLIC_TURN_URLS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return [];
  return [{ urls, username: e.TURN_USERNAME ?? e.NEXT_PUBLIC_TURN_USERNAME, credential: e.TURN_CREDENTIAL ?? e.NEXT_PUBLIC_TURN_CREDENTIAL }];
}

const cloudflareKeys = (e: Env = process.env) => {
  const id = e.CLOUDFLARE_TURN_KEY_ID || e.TURN_KEY_ID || '';
  const token = e.CLOUDFLARE_TURN_API_TOKEN || e.TURN_KEY_API_TOKEN || '';
  return id && token ? { id, token } : null;
};

let cached: { servers: IceServer[]; until: number } | null = null;
let pending: Promise<IceServer[]> | null = null;

async function cloudflareIce(keys: { id: string; token: string }): Promise<IceServer[]> {
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keys.id)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keys.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: CF_TTL_S }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`cloudflare turn ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const servers = parseCloudflareIce(await r.json());
  if (!servers.length) throw new Error('cloudflare turn: no servers in the answer');
  return servers;
}

/** The ICE servers to hand to a signed-in browser (TURN only; the browser adds public STUN itself). */
export async function iceConfig(): Promise<IceConfig> {
  const keys = cloudflareKeys();
  if (keys) {
    if (cached && cached.until > Date.now()) return { servers: cached.servers, ttl: Math.round((cached.until - Date.now()) / 1000), source: 'cloudflare' };
    try {
      pending ??= cloudflareIce(keys).finally(() => { pending = null; });
      const servers = await pending;
      cached = { servers, until: Date.now() + CF_REUSE_MS };
      return { servers, ttl: CF_REUSE_MS / 1000, source: 'cloudflare' };
    } catch (e) {
      console.error('[turn]', e);
      // Fixed credentials, if any, still help while Cloudflare cannot be reached.
    }
  }
  const servers = staticIce();
  return { servers, ttl: null, source: servers.length ? 'static' : 'none' };
}

export function resetIceCache() { cached = null; pending = null; }
