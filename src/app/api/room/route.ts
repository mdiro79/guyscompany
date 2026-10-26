import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { currentUser } from '@/lib/auth';
import { env, isDemo } from '@/lib/env';
import { broadcast, type RelayMessage } from '@/lib/realtime/relay';
import { ROOM_TOPIC, TAB_ID_PATTERN } from '@/lib/realtime/topic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Room relay for browsers that cannot keep a WebSocket to Supabase (it closes with 1006 on some
// networks): the server joins the room channel for the tab and streams what it receives as
// Server-Sent Events, and POST sends the tab's broadcasts and presence changes.

// A stream lives a few minutes (function time limit); the client opens the next one on "rotate"
// and only then closes this one, so the tab never drops out of presence.
const ROTATE_AFTER_MS = 240_000;
const END_AFTER_MS = 280_000;
const MAX_BODY = 64_000;

const device = (v: unknown) => (v === 'phone' ? 'phone' : 'computer') as 'phone' | 'computer';

export async function GET(req: NextRequest) {
  if (isDemo) return NextResponse.json({ error: 'demo' }, { status: 404 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const tabId = q.get('tab') ?? '';
  if (!TAB_ID_PATTERN.test(tabId)) return NextResponse.json({ error: 'tab' }, { status: 400 });
  // The user id always comes from the session, never from the request.
  let meta = { userId: user.id, device: device(q.get('device')), micActive: q.get('mic') === '1', tabId, since: Number(q.get('since')) || Date.now() };

  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const encoder = new TextEncoder();
  let finish = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => { if (!closed) controller.enqueue(encoder.encode(chunk)); };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const channel = supabase.channel(ROOM_TOPIC, { config: { broadcast: { self: false }, presence: { key: tabId } } });
      channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (event === '__track') {
          if (p.tabId === tabId && p.userId === meta.userId) { meta = { ...meta, device: device(p.device), micActive: !!p.micActive }; void channel.track(meta); }
          return;
        }
        if (p.__tab === tabId) return; // this tab's own message coming back
        send('msg', { event, payload: p });
      });
      channel.on('presence', { event: 'sync' }, () => send('presence', Object.values(channel.presenceState()).flat()));
      channel.subscribe(async (status, err) => {
        send('status', { status, error: err?.message ?? null });
        if (status === 'SUBSCRIBED') await channel.track(meta);
      });
      write('retry: 2000\n\n');
      const ping = setInterval(() => write(': ping\n\n'), 15_000);
      const rotate = setTimeout(() => send('rotate', {}), ROTATE_AFTER_MS);
      const end = setTimeout(() => finish(), END_AFTER_MS);
      finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping); clearTimeout(rotate); clearTimeout(end);
        void supabase.removeAllChannels();
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener('abort', () => finish());
    },
    cancel() { finish(); },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' },
  });
}

export async function POST(req: NextRequest) {
  if (isDemo) return NextResponse.json({ error: 'demo' }, { status: 404 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let body: { tab?: unknown; messages?: unknown; track?: { device?: unknown; micActive?: unknown } };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json' }, { status: 400 }); }
  const tabId = typeof body.tab === 'string' ? body.tab : '';
  if (!TAB_ID_PATTERN.test(tabId)) return NextResponse.json({ error: 'tab' }, { status: 400 });

  const out: RelayMessage[] = [];
  if (Array.isArray(body.messages)) {
    for (const m of body.messages.slice(0, 50) as { event?: unknown; payload?: unknown }[]) {
      if (typeof m?.event !== 'string' || m.event.startsWith('__') || typeof m.payload !== 'object' || !m.payload) continue;
      out.push({ event: m.event, payload: { ...(m.payload as Record<string, unknown>), __tab: tabId } });
    }
  }
  if (body.track) out.push({ event: '__track', payload: { tabId, userId: user.id, device: device(body.track.device), micActive: !!body.track.micActive } });
  if (!out.length) return new NextResponse(null, { status: 204 });
  try {
    await broadcast(out);
  } catch (e) {
    console.error('[room] relay broadcast failed:', e);
    return NextResponse.json({ error: 'relay' }, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
