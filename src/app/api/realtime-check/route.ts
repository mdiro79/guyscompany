import { NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'crypto';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { env, isDemo, serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Diagnoses "nobody shows as online": two clients join a throw-away channel the way the browser joins
// the presence room, and report whether they subscribe, see each other's presence and get broadcasts.
// Runs once with the public key (signed out) and once as a signed-in user (token from the JWT secret).

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function userToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: randomUUID(), role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 300 })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

interface Probe { statuses: string[]; sawPeers: number; gotBroadcast: boolean }

async function probe(topic: string, opts: { token?: string; private?: boolean }) {
  const run = async (name: string) => {
    const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (opts.token) await sb.realtime.setAuth(opts.token);
    const p: Probe = { statuses: [], sawPeers: 0, gotBroadcast: false };
    const ch: RealtimeChannel = sb.channel(topic, { config: { private: !!opts.private, broadcast: { self: false }, presence: { key: name } } });
    ch.on('presence', { event: 'sync' }, () => { p.sawPeers = Math.max(p.sawPeers, Object.keys(ch.presenceState()).length); });
    ch.on('broadcast', { event: 'ping' }, () => { p.gotBroadcast = true; });
    ch.subscribe(async (status, err) => {
      p.statuses.push(err ? `${status}: ${err.message}` : status);
      if (status === 'SUBSCRIBED') {
        const tracked = await ch.track({ name });
        if (tracked !== 'ok') p.statuses.push(`track: ${tracked}`);
      }
    });
    return { sb, ch, p };
  };
  const a = await run('a');
  const b = await run('b');
  await new Promise((r) => setTimeout(r, 4000));
  await a.ch.send({ type: 'broadcast', event: 'ping', payload: {} });
  await new Promise((r) => setTimeout(r, 1500));
  await Promise.all([a.sb.removeAllChannels(), b.sb.removeAllChannels()]);
  return { a: a.p, b: b.p, ok: a.p.sawPeers >= 2 && b.p.sawPeers >= 2 && b.p.gotBroadcast };
}

export async function GET() {
  if (isDemo) return NextResponse.json({ mode: 'demo' });
  const topic = `gc-check-${randomUUID().slice(0, 8)}`;
  const secret = serverEnv().jwtSecret;
  const [anon, user, userPrivate] = await Promise.all([
    probe(topic, {}).catch((e) => ({ error: String(e) })),
    secret ? probe(`${topic}-u`, { token: userToken(secret) }).catch((e) => ({ error: String(e) })) : null,
    secret ? probe(`${topic}-p`, { token: userToken(secret), private: true }).catch((e) => ({ error: String(e) })) : null,
  ]);
  return NextResponse.json({ anon, user, userPrivate, keyKind: env.supabaseAnonKey.startsWith('sb_') ? 'publishable' : 'jwt' }, { headers: { 'cache-control': 'no-store' } });
}
