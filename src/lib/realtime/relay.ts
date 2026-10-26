import 'server-only';
import { env } from '@/lib/env';
import { ROOM_TOPIC } from './topic';

export interface RelayMessage { event: string; payload: Record<string, unknown> }

// Sends broadcasts to the room through Supabase's REST endpoint: the server reaches Supabase even
// where the browsers' WebSocket to supabase.co is blocked.
export async function broadcast(messages: RelayMessage[], topic = ROOM_TOPIC) {
  const key = env.supabaseAnonKey;
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
  // Publishable keys (sb_publishable_…) are not JWTs and only go in the apikey header.
  if (!key.startsWith('sb_')) headers.authorization = `Bearer ${key}`;
  const r = await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages: messages.map((m) => ({ topic, event: m.event, payload: m.payload })) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`broadcast ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
