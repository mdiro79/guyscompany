import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceMeta } from './room';

// Two tabs on networks with no route between them (no TURN): the WebRTC link never opens. They must
// still see each other in the office through the room channel, sparingly, and stop using it once a
// link opens. Stuck links are restarted with a growing pause instead of every few seconds.

type Handler = (p: Record<string, unknown>) => void;
const h = vi.hoisted(() => {
  const bus: FakeRoomT[] = [];
  const state = { nextTab: 'tab-a' };
  interface FakeRoomT {
    tabId: string;
    handlers: Map<string, Set<Handler>>;
    presence: Set<(p: PresenceMeta[]) => void>;
    sent: { event: string; payload: Record<string, unknown> }[];
    tracked: Record<string, unknown>[];
    on(event: string, cb: Handler): () => void;
    send(event: string, payload: Record<string, unknown>): void;
    track(m: Record<string, unknown>): void;
    onPresence(cb: (p: PresenceMeta[]) => void): () => void;
    serverOffsetMs(): number;
  }
  const fakeRoom = (tabId: string): FakeRoomT => {
    const room: FakeRoomT = {
      tabId,
      handlers: new Map(),
      presence: new Set(),
      sent: [],
      tracked: [],
      on(event, cb) {
        if (!room.handlers.has(event)) room.handlers.set(event, new Set());
        room.handlers.get(event)!.add(cb);
        return () => { room.handlers.get(event)?.delete(cb); };
      },
      send(event, payload) {
        room.sent.push({ event, payload });
        for (const r of bus) if (r !== room) r.handlers.get(event)?.forEach((cb) => cb(JSON.parse(JSON.stringify(payload))));
      },
      track(m) { room.tracked.push(m); },
      onPresence(cb) { room.presence.add(cb); return () => { room.presence.delete(cb); }; },
      serverOffsetMs: () => 0,
    };
    bus.push(room);
    return room;
  };
  return { bus, state, fakeRoom };
});
vi.mock('./room', () => ({ getRoom: () => h.fakeRoom(h.state.nextTab) }));

class FakeChannel { readyState = 'connecting'; send = vi.fn(); onmessage: unknown = null; onopen: unknown = null; constructor(public label: string) {} }
class FakePC {
  static all: FakePC[] = [];
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription = null;
  remoteDescription = null;
  restarts = 0;
  channels: FakeChannel[] = [];
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel = null; ontrack = null; onicecandidate = null; onnegotiationneeded = null;
  constructor(public config: RTCConfiguration) { FakePC.all.push(this); }
  addTransceiver() { return { sender: { replaceTrack: async () => {} } }; }
  createDataChannel(label: string) { const c = new FakeChannel(label); this.channels.push(c); return c; }
  getConfiguration() { return this.config; }
  setConfiguration(c: RTCConfiguration) { this.config = c; }
  restartIce() { this.restarts++; }
  close() { this.connectionState = 'closed'; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
}

const meta = (userId: string, tabId: string, office: boolean): PresenceMeta => ({ userId, tabId, device: 'computer', micActive: false, office, since: 0 });
const meshSent = (i: number) => h.bus[i].sent.filter((m) => m.event === 'mesh').map((m) => m.payload);

async function setup(turn: { servers: unknown[]; ttl: number | null } = { servers: [], ttl: null }) {
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', FakePC);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => turn })));
  const mod = await import('./mesh');
  h.state.nextTab = 'tab-a';
  const a = new mod.Mesh('ua', 'computer');
  h.state.nextTab = 'tab-b';
  const b = new mod.Mesh('ub', 'phone');
  const present = async (aOffice: boolean, bOffice: boolean) => {
    const list = [meta('ua', 'tab-a', aOffice), meta('ub', 'tab-b', bOffice)];
    h.bus.forEach((r) => r.presence.forEach((cb) => cb(list)));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { mod, a, b, present };
}

describe('mesh room fallback', () => {
  beforeEach(() => { h.bus.length = 0; FakePC.all.length = 0; vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('carries positions and events through the room while the link cannot open', async () => {
    const { mod, a, b, present } = await setup();
    const states: { user: string; msg: Record<string, unknown>; viaRoom?: boolean }[] = [];
    const events: Record<string, unknown>[] = [];
    b.onState((from, msg, viaRoom) => states.push({ user: from.userId, msg, viaRoom }));
    b.onEvent((_, msg) => events.push(msg));
    await present(true, true);
    expect(FakePC.all).toHaveLength(1); // tab-a starts the link; it never connects

    // During the grace period the link gets its chance: nothing through the room.
    a.sendState({ k: 'pose', x: 1 });
    a.sendEvent({ type: 'door', id: 'd1', open: true, t: 1 });
    await vi.advanceTimersByTimeAsync(mod.ROOM_FLUSH_MS + 10);
    expect(meshSent(0)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(mod.FALLBACK_AFTER_MS);
    a.sendState({ k: 'pose', x: 2 });
    a.sendEvent({ type: 'emote', id: 'smile' });
    a.sendEvent({ type: 'typing', on: true });
    await vi.advanceTimersByTimeAsync(mod.ROOM_FLUSH_MS + 10);
    // One room message carries the position and both events, addressed to the other tab only.
    expect(meshSent(0)).toEqual([{ from: 'tab-a', fromUser: 'ua', fromDevice: 'computer', to: ['tab-b'], s: { k: 'pose', x: 2 }, e: [{ type: 'emote', id: 'smile' }, { type: 'typing', on: true }] }]);
    expect(states).toEqual([{ user: 'ua', msg: { k: 'pose', x: 2 }, viaRoom: true }]);
    expect(events).toEqual([{ type: 'emote', id: 'smile' }, { type: 'typing', on: true }]);

    // The office calls sendState ~15 times a second: moving goes out every ROOM_STATE_MS,
    // standing still only every ROOM_STATE_IDLE_MS.
    const before = meshSent(0).length;
    for (let i = 0; i < 15; i++) { a.sendState({ k: 'pose', x: 3 + i }); await vi.advanceTimersByTimeAsync(66); }
    const moving = meshSent(0).length - before;
    expect(moving).toBeGreaterThanOrEqual(2);
    expect(moving).toBeLessThanOrEqual(3);
    const idleStart = meshSent(0).length;
    for (let i = 0; i < 150; i++) { a.sendState({ k: 'pose', x: 99 }); await vi.advanceTimersByTimeAsync(66); }
    const idle = meshSent(0).length - idleStart; // ~10 s standing still: the new spot once, then heartbeats
    expect(idle).toBeGreaterThanOrEqual(2);
    expect(idle).toBeLessThanOrEqual(3);
  });

  it('sends positions only to tabs showing the office, events to every tab', async () => {
    const { mod, a, present } = await setup();
    await present(true, false);
    await vi.advanceTimersByTimeAsync(mod.FALLBACK_AFTER_MS + 100);
    a.sendState({ k: 'pose', x: 1 });
    await vi.advanceTimersByTimeAsync(mod.ROOM_FLUSH_MS + 10);
    expect(meshSent(0)).toHaveLength(0);
    a.sendEvent({ type: 'board', u: 'ua' });
    a.sendEvent({ type: 'board', u: 'ua', to: 'tab-elsewhere' }); // meant for another tab only
    await vi.advanceTimersByTimeAsync(mod.ROOM_FLUSH_MS + 10);
    expect(meshSent(0)).toEqual([expect.objectContaining({ to: ['tab-b'], e: [{ type: 'board', u: 'ua' }] })]);
    expect(meshSent(0)[0]).not.toHaveProperty('s');
  });

  it('announces a tab that the room starts to serve, and stops once the link opens', async () => {
    const { mod, a, present } = await setup();
    const peers = vi.fn();
    a.onPeers(peers);
    await present(true, true);
    peers.mockClear();
    await vi.advanceTimersByTimeAsync(mod.FALLBACK_AFTER_MS + 2100);
    // Listeners hear about it like an opened link, so they send their snapshots (doors, board…).
    expect(peers).toHaveBeenCalledWith([{ tabId: 'tab-b', userId: 'ub', device: 'computer' }]);
    expect(a.debugLinks()[0]).toContain('+room');

    const pc = FakePC.all[0];
    pc.connectionState = 'connected';
    pc.channels.forEach((c) => { c.readyState = 'open'; });
    const sentBefore = meshSent(0).length;
    a.sendState({ k: 'pose', x: 5 });
    a.sendEvent({ type: 'emote', id: 'wink' });
    await vi.advanceTimersByTimeAsync(mod.ROOM_FLUSH_MS + 10);
    expect(meshSent(0)).toHaveLength(sentBefore);
    expect(pc.channels[0].send).toHaveBeenCalledWith(JSON.stringify({ k: 'pose', x: 5 }));
    expect(pc.channels[1].send).toHaveBeenCalledWith(JSON.stringify({ type: 'emote', id: 'wink' }));
  });

  it('tells the others when the office is open', async () => {
    const { a } = await setup();
    a.setInOffice(true);
    a.setInOffice(true);
    a.setInOffice(false);
    expect(h.bus[0].tracked).toEqual([{ userId: 'ua', device: 'computer', office: true }, { userId: 'ua', device: 'computer', office: false }]);
  });

  it('restarts a stuck link with a growing pause', async () => {
    const { present } = await setup();
    await present(true, true);
    const pc = FakePC.all[0];
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // 15 s, then 30 s, 1, 2, 4 min, then every 5 min: a handful in ten minutes (it used to be ~75).
    expect(pc.restarts).toBeGreaterThanOrEqual(4);
    expect(pc.restarts).toBeLessThanOrEqual(6);
  });

  it('uses the TURN relay from /api/turn and asks again before the credentials expire', async () => {
    const turn = { servers: [{ urls: ['turns:turn.example.com:443?transport=tcp'], username: 'u', credential: 'c' }], ttl: 3600 };
    const { a, present } = await setup(turn);
    await present(true, true);
    expect(FakePC.all[0].config.iceServers).toContainEqual(turn.servers[0]);
    expect(a.debugIce()).toBe('stun+turn');
    expect(fetch).toHaveBeenCalledTimes(2); // once per tab
    await vi.advanceTimersByTimeAsync(1800 * 1000 + 10);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
