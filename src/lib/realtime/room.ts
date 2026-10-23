'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';

export interface PresenceMeta { userId: string; device: 'phone' | 'computer'; tabId: string; micActive: boolean; since: number }
type Handler = (payload: Record<string, unknown>) => void;

// Low-volume room channel: presence + WebRTC signaling. Supabase Realtime when configured,
// otherwise BroadcastChannel (same browser, demo mode). Movement never goes through here.
export interface Room {
  tabId: string;
  on(event: string, cb: Handler): () => void;
  send(event: string, payload: Record<string, unknown>): void;
  track(meta: Omit<PresenceMeta, 'tabId' | 'since'>): void;
  onPresence(cb: (peers: PresenceMeta[]) => void): () => void;
  serverOffsetMs(): number;
}

const tabId = typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random());
let room: Room | null = null;

export function getRoom(): Room {
  room ??= supabaseBrowser() ? supabaseRoom() : localRoom();
  return room;
}

function emitter() {
  const handlers = new Map<string, Set<Handler>>();
  const presenceCbs = new Set<(p: PresenceMeta[]) => void>();
  return {
    handlers, presenceCbs,
    on(event: string, cb: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
      return () => { handlers.get(event)?.delete(cb); };
    },
    emit(event: string, payload: Record<string, unknown>) { handlers.get(event)?.forEach((h) => h(payload)); },
    onPresence(cb: (p: PresenceMeta[]) => void) { presenceCbs.add(cb); return () => { presenceCbs.delete(cb); }; },
    emitPresence(p: PresenceMeta[]) { presenceCbs.forEach((cb) => cb(p)); },
  };
}

function supabaseRoom(): Room {
  const supabase = supabaseBrowser()!;
  const ev = emitter();
  let offset = 0;
  let meta: PresenceMeta | null = null;
  let ready = false;
  const channel: RealtimeChannel = supabase.channel('gc-room', { config: { broadcast: { self: false }, presence: { key: tabId } } });
  channel.on('broadcast', { event: '*' }, ({ event, payload }) => ev.emit(event, payload as Record<string, unknown>));
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceMeta>();
    ev.emitPresence(Object.values(state).flat());
  });
  channel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return;
    ready = true;
    if (meta) await channel.track(meta);
  });
  // Clock offset against the server (Date header of a tiny request) for last-command-wins ordering.
  fetch('/api/time', { cache: 'no-store' }).then(async (r) => {
    const t0 = Date.now();
    const { now } = (await r.json()) as { now: number };
    offset = now - t0;
  }).catch(() => {});
  return {
    tabId,
    on: ev.on,
    send(event, payload) { channel.send({ type: 'broadcast', event, payload }); },
    track(m) { meta = { ...m, tabId, since: meta?.since ?? Date.now() }; if (ready) channel.track(meta); },
    onPresence: ev.onPresence,
    serverOffsetMs: () => offset,
  };
}

function localRoom(): Room {
  const ev = emitter();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gc-room') : null;
  const peers = new Map<string, { meta: PresenceMeta; seen: number }>();
  let meta: PresenceMeta | null = null;
  const publish = () => ev.emitPresence([...peers.values()].map((p) => p.meta).concat(meta ? [meta] : []));
  bc?.addEventListener('message', (e: MessageEvent<{ event: string; payload: Record<string, unknown> }>) => {
    const { event, payload } = e.data;
    if (event === '__presence') {
      const m = payload as unknown as PresenceMeta;
      const isNew = !peers.has(m.tabId);
      peers.set(m.tabId, { meta: m, seen: Date.now() });
      if (isNew) { publish(); if (meta) bc.postMessage({ event: '__presence', payload: meta }); }
      return;
    }
    if (event === '__leave') { peers.delete(String(payload.tabId)); publish(); return; }
    ev.emit(event, payload);
  });
  setInterval(() => {
    if (meta) bc?.postMessage({ event: '__presence', payload: meta });
    let changed = false;
    for (const [id, p] of peers) if (Date.now() - p.seen > 6000) { peers.delete(id); changed = true; }
    if (changed) publish();
  }, 2000);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => bc?.postMessage({ event: '__leave', payload: { tabId } }));
  return {
    tabId,
    on: ev.on,
    send(event, payload) { bc?.postMessage({ event, payload }); },
    track(m) { meta = { ...m, tabId, since: meta?.since ?? Date.now() }; bc?.postMessage({ event: '__presence', payload: meta }); publish(); },
    onPresence: ev.onPresence,
    serverOffsetMs: () => 0,
  };
}

// Epoch milliseconds corrected towards the server clock (used for last-command-wins ordering).
export const syncedNow = () => Date.now() + (room?.serverOffsetMs() ?? 0);
