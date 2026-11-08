'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ROOM_TOPIC } from './topic';

// office: the tab shows the 3D office (only those get positions through the room fallback, see mesh.ts).
export interface PresenceMeta { userId: string; device: 'phone' | 'computer'; tabId: string; micActive: boolean; office?: boolean; since: number }
// track() merges: each caller announces only what it knows (the office its flag, the voice panel its mic).
export type TrackMeta = Pick<PresenceMeta, 'userId'> & Partial<Omit<PresenceMeta, 'tabId' | 'since' | 'userId'>>;
const merge = (prev: PresenceMeta | null, m: TrackMeta): PresenceMeta =>
  ({ device: 'computer', micActive: false, office: false, ...prev, ...m, tabId, since: prev?.since ?? Date.now() });
type Handler = (payload: Record<string, unknown>) => void;

// Low-volume room channel: presence + WebRTC signaling. Supabase Realtime when configured,
// otherwise BroadcastChannel (same browser, demo mode). Movement never goes through here.
export interface Room {
  tabId: string;
  on(event: string, cb: Handler): () => void;
  send(event: string, payload: Record<string, unknown>): void;
  track(meta: TrackMeta): void;
  onPresence(cb: (peers: PresenceMeta[]) => void): () => void;
  serverOffsetMs(): number;
}

const tabId = typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random());
let room: Room | null = null;

// Connection state of the Realtime channel, shown by the debug badge (?debug=1).
export const realtimeStatus = { value: 'idle' as string, listeners: new Set<() => void>() };
function setStatus(value: string) { realtimeStatus.value = value; realtimeStatus.listeners.forEach((cb) => cb()); }

export function getRoom(): Room {
  room ??= supabaseBrowser() ? supabaseRoom() : localRoom();
  return room;
}

function emitter() {
  const handlers = new Map<string, Set<Handler>>();
  const presenceCbs = new Set<(p: PresenceMeta[]) => void>();
  // The latest list is replayed to late subscribers: the first sync often arrives before they listen.
  let last: PresenceMeta[] | null = null;
  return {
    handlers, presenceCbs,
    on(event: string, cb: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
      return () => { handlers.get(event)?.delete(cb); };
    },
    emit(event: string, payload: Record<string, unknown>) { handlers.get(event)?.forEach((h) => h(payload)); },
    onPresence(cb: (p: PresenceMeta[]) => void) { presenceCbs.add(cb); if (last) cb(last); return () => { presenceCbs.delete(cb); }; },
    emitPresence(p: PresenceMeta[]) { last = p; presenceCbs.forEach((cb) => cb(p)); },
  };
}

type Emitter = ReturnType<typeof emitter>;
interface Transport { send(event: string, payload: Record<string, unknown>): void; track(meta: PresenceMeta): void; close(): void }

// Some networks cut the browser's WebSocket to supabase.co (closed with 1006, then TIMED_OUT) while the
// site itself loads fine. Then the room goes through our own server instead (/api/room), and the
// choice is remembered for a day so the next visit does not wait for the direct attempt to fail.
const DIRECT_TIMEOUT_MS = 8000;
const RELAY_KEY = 'gc-room-relay';
const RELAY_REMEMBER_MS = 24 * 60 * 60 * 1000;
// Must stay under MAX_BODY and the 50-message cap in /api/room.
const RELAY_POST_BYTES = 48_000;
const RELAY_POST_MESSAGES = 50;
const relayRemembered = () => { try { return Date.now() - Number(localStorage.getItem(RELAY_KEY) ?? 0) < RELAY_REMEMBER_MS; } catch { return false; } };
const rememberRelay = () => { try { localStorage.setItem(RELAY_KEY, String(Date.now())); } catch {} };

function supabaseRoom(): Room {
  const ev = emitter();
  let offset = 0;
  let meta: PresenceMeta | null = null;
  let transport: Transport;
  const useRelay = () => {
    transport.close();
    rememberRelay();
    transport = relayTransport(ev);
    if (meta) transport.track(meta);
  };
  transport = relayRemembered() ? relayTransport(ev) : directTransport(ev, () => meta, useRelay);
  // Clock offset against the server (Date header of a tiny request) for last-command-wins ordering.
  fetch('/api/time', { cache: 'no-store' }).then(async (r) => {
    const t0 = Date.now();
    const { now } = (await r.json()) as { now: number };
    offset = now - t0;
  }).catch(() => {});
  return {
    tabId,
    on: ev.on,
    send(event, payload) { transport.send(event, payload); },
    track(m) { meta = merge(meta, m); transport.track(meta); },
    onPresence: ev.onPresence,
    serverOffsetMs: () => offset,
  };
}

function directTransport(ev: Emitter, getMeta: () => PresenceMeta | null, fail: () => void): Transport {
  const supabase = supabaseBrowser()!;
  let ready = false;
  let closed = false;
  const channel: RealtimeChannel = supabase.channel(ROOM_TOPIC, { config: { broadcast: { self: false }, presence: { key: tabId } } });
  channel.on('broadcast', { event: '*' }, ({ event, payload }) => ev.emit(event, payload as Record<string, unknown>));
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceMeta>();
    ev.emitPresence(Object.values(state).flat());
  });
  // Not connected in time (first join, or after losing the connection): switch to the relay.
  let giveUp: ReturnType<typeof setTimeout> | null = setTimeout(() => fail(), DIRECT_TIMEOUT_MS);
  setStatus('connecting');
  channel.subscribe(async (status, err) => {
    if (closed) return;
    setStatus(err ? `${status}: ${err.message}` : status);
    if (status !== 'SUBSCRIBED') {
      ready = false;
      giveUp ??= setTimeout(() => fail(), DIRECT_TIMEOUT_MS);
      return;
    }
    if (giveUp) { clearTimeout(giveUp); giveUp = null; }
    ready = true;
    const meta = getMeta();
    if (meta) await channel.track(meta);
  });
  // Phones suspend sockets in the background: announce ourselves again when the page is back or online.
  const reannounce = () => { const meta = getMeta(); if (document.visibilityState === 'visible' && ready && meta) void channel.track(meta); };
  document.addEventListener('visibilitychange', reannounce);
  window.addEventListener('online', reannounce);
  return {
    send(event, payload) { void channel.send({ type: 'broadcast', event, payload }); },
    track(meta) { if (ready) void channel.track(meta); },
    close() {
      closed = true;
      if (giveUp) clearTimeout(giveUp);
      document.removeEventListener('visibilitychange', reannounce);
      window.removeEventListener('online', reannounce);
      void supabase.removeChannel(channel);
    },
  };
}

// The room through our server: an event stream to receive, POST to send. The stream is opened on the
// first track() (a page that never announces itself, like the dashboard on the 3D monitor, stays out).
function relayTransport(ev: Emitter): Transport {
  let meta: PresenceMeta | null = null;
  let source: EventSource | null = null;
  let outbox: { event: string; payload: Record<string, unknown> }[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const post = (body: Record<string, unknown>) =>
    fetch('/api/room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab: tabId, ...body }), keepalive: true }).catch(() => {});
  // Signaling comes in bursts (ICE candidates); they leave together a moment later, in requests that
  // stay under the relay's size limit (a large one used to be refused whole, signals included).
  const flush = () => {
    flushTimer = null;
    let batch: typeof outbox = [];
    let size = 0;
    for (const m of outbox.splice(0)) {
      const n = JSON.stringify(m).length;
      if (batch.length && (size + n > RELAY_POST_BYTES || batch.length >= RELAY_POST_MESSAGES)) { void post({ messages: batch }); batch = []; size = 0; }
      batch.push(m); size += n;
    }
    if (batch.length) void post({ messages: batch });
  };
  const trackBody = (m: PresenceMeta) => ({ device: m.device, micActive: m.micActive, office: !!m.office });
  const open = () => {
    const m = meta!;
    const q = new URLSearchParams({ tab: tabId, device: m.device, mic: m.micActive ? '1' : '0', office: m.office ? '1' : '0', since: String(m.since) });
    const es = new EventSource(`/api/room?${q}`);
    const parse = (e: Event) => JSON.parse((e as MessageEvent<string>).data);
    es.addEventListener('status', (e) => {
      const { status, error } = parse(e) as { status: string; error: string | null };
      // A newer stream takes over once it is in the room; the old one closes only then.
      if (status === 'SUBSCRIBED' && source !== es) { source?.close(); source = es; }
      if (source !== es) return;
      setStatus(`relay ${error ? `${status}: ${error}` : status}`);
      // After an automatic reconnect the server only knows the meta from the stream's address.
      if (status === 'SUBSCRIBED' && meta) void post({ track: trackBody(meta) });
    });
    es.addEventListener('msg', (e) => { if (source === es) { const { event, payload } = parse(e); ev.emit(event, payload); } });
    es.addEventListener('presence', (e) => { if (source === es) ev.emitPresence(parse(e)); });
    es.addEventListener('rotate', () => { if (source === es) open(); });
    es.onerror = () => { if (source === es) setStatus('relay reconnecting'); };
    return es;
  };
  // A stream the browser gave up on (phone in the background, network change) is opened again.
  const revive = () => { if (document.visibilityState === 'visible' && source?.readyState === EventSource.CLOSED) source = open(); };
  document.addEventListener('visibilitychange', revive);
  window.addEventListener('online', revive);
  setStatus('relay connecting');
  return {
    send(event, payload) { outbox.push({ event, payload }); flushTimer ??= setTimeout(flush, 40); },
    track(m) {
      const first = !meta;
      meta = m;
      if (first) source = open();
      else void post({ track: trackBody(m) });
    },
    close() {
      source?.close(); source = null;
      if (flushTimer) clearTimeout(flushTimer);
      outbox = [];
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('online', revive);
    },
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
      const prev = peers.get(m.tabId);
      peers.set(m.tabId, { meta: m, seen: Date.now() });
      // A changed announcement (microphone, office open) is passed on like Supabase's presence sync.
      if (!prev || JSON.stringify(prev.meta) !== JSON.stringify(m)) publish();
      if (!prev && meta) bc.postMessage({ event: '__presence', payload: meta });
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
    track(m) { meta = merge(meta, m); bc?.postMessage({ event: '__presence', payload: meta }); publish(); },
    onPresence: ev.onPresence,
    serverOffsetMs: () => 0,
  };
}

// Epoch milliseconds corrected towards the server clock (used for last-command-wins ordering).
export const syncedNow = () => Date.now() + (room?.serverOffsetMs() ?? 0);
