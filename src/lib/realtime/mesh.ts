'use client';
import { getRoom, type PresenceMeta, type Room } from './room';

// Peer-to-peer mesh between all open tabs of the team (4 people → at most a handful of links).
// Data channels carry high-rate state (position, emotes); audio rides on the same connections.
// Supabase Realtime (or BroadcastChannel in demo) is only used for signaling.
//
// Two people on different networks (home internet vs. mobile data, carrier NAT) often cannot open a
// direct link. A TURN relay fixes that for everything, voice included (/api/turn). Until a link
// opens, what would travel on it goes through the room channel instead (the "room fallback"):
// positions a few times a second to tabs showing the office, events in small batches. That keeps
// everyone in the same office even without TURN, at the cost of Supabase messages; voice still
// needs the link.

export interface PeerInfo { tabId: string; userId: string; device: 'phone' | 'computer' }
// viaRoom: the message came through the room fallback (later and less often than over a link).
type Listener<T> = (from: PeerInfo, msg: T, viaRoom?: boolean) => void;

interface Peer {
  info: PeerInfo;
  pc: RTCPeerConnection;
  state: RTCDataChannel | null;
  events: RTCDataChannel | null;
  sender: RTCRtpSender | null;
  remoteStream: MediaStream | null;
  makingOffer: boolean;
  polite: boolean;
  createdAt: number;
  // ICE restarts back off (15 s, 30 s, 1 min … 5 min): every restart is a burst of signaling messages.
  restarts: number;
  restartAt: number;
  // Signals are handled one at a time, and candidates wait for the remote description.
  queue: Promise<void>;
  pendingIce: RTCIceCandidateInit[];
}

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

const ICE_FETCH_TIMEOUT_MS = 5000;
const RESTART_FIRST_MS = 15_000;
const RESTART_MAX_MS = 5 * 60_000;
// The room fallback starts for a tab whose link has not opened this long after it appeared.
export const FALLBACK_AFTER_MS = 10_000;
// Room messages leave together after this delay (a position, a door and a board change share one).
export const ROOM_FLUSH_MS = 120;
// Positions through the room: at most this often while moving or turning…
export const ROOM_STATE_MS = 400;
// …and this often while standing still, so the character stays shown (see ROOM_POSE_GRACE_MS).
export const ROOM_STATE_IDLE_MS = 5000;
// One room message stays well under the relay's request limit and Supabase's payload limit.
const ROOM_BATCH_BYTES = 40_000;

interface IceAnswer { servers: RTCIceServer[]; ttl: number | null; ok: boolean }

// STUN plus the TURN relay the server hands out (see /api/turn). A slow answer must not hold up the links.
async function loadIceServers(): Promise<IceAnswer> {
  try {
    const r = await fetch('/api/turn', { cache: 'no-store', signal: AbortSignal.timeout(ICE_FETCH_TIMEOUT_MS) });
    const { servers, ttl } = (await r.json()) as { servers?: RTCIceServer[]; ttl?: number | null };
    return { servers: [...STUN, ...(Array.isArray(servers) ? servers : [])], ttl: typeof ttl === 'number' ? ttl : null, ok: r.ok };
  } catch { return { servers: STUN, ttl: null, ok: false }; }
}

// A link counts as open only while its connection is up: a channel can still read "open" for a while
// after the route is gone.
const linkOpen = (p: Peer | undefined, kind: 'state' | 'events') => {
  const dc = kind === 'state' ? p?.state : p?.events;
  return !!p && dc?.readyState === 'open' && p.pc.connectionState === 'connected';
};

export class Mesh {
  readonly room: Room;
  readonly self: PeerInfo;
  private peers = new Map<string, Peer>();
  private stateListeners = new Set<Listener<Record<string, unknown>>>();
  private eventListeners = new Set<Listener<Record<string, unknown>>>();
  private trackListeners = new Set<(peer: PeerInfo, stream: MediaStream | null) => void>();
  private peerListeners = new Set<(peers: PeerInfo[]) => void>();
  private localTrack: MediaStreamTrack | null = null;
  private presence: PresenceMeta[] = [];
  private ice: RTCIceServer[] = STUN;
  private hasTurn = false;
  private ready: Promise<void>;
  // Room fallback: when each tab first appeared, which tabs it currently serves, and what waits to leave.
  private seen = new Map<string, number>();
  private roomPeers = new Set<string>();
  private inOffice = false;
  private outTo = new Set<string>();
  private outState: Record<string, unknown> | null = null;
  private outEvents: { msg: Record<string, unknown>; size: number }[] = [];
  private outTimer: ReturnType<typeof setTimeout> | null = null;
  private roomStateSent = '';
  private roomStateAt = 0;

  constructor(userId: string, device: 'phone' | 'computer') {
    this.room = getRoom();
    this.self = { tabId: this.room.tabId, userId, device };
    // Links are only created once the relay settings are known, so the first connection already has them.
    this.ready = this.loadIce();
    this.room.on('rtc', (msg) => { void this.ready.then(() => this.onSignal(msg)); });
    this.room.on('mesh', (msg) => this.onRoomMessage(msg));
    this.room.onPresence((list) => {
      this.presence = list;
      this.noteSeen(list);
      void this.ready.then(() => this.syncPeers(list));
    });
    // Stuck links (never connected, or dropped) get an ICE restart instead of staying silent forever.
    setInterval(() => {
      for (const p of this.peers.values()) if (p.pc.connectionState !== 'connected') this.maybeRestart(p);
    }, 5000);
    setInterval(() => this.checkRoomPeers(), 2000);
  }

  get presenceList() { return this.presence; }
  debugLinks() {
    const room = new Set(this.roomTargets('events'));
    return [...this.peers.values()].map((p) => `${p.info.userId.slice(0, 4)}:${p.pc.connectionState}/${p.pc.iceConnectionState}${room.has(p.info.tabId) ? '+room' : ''}`);
  }
  debugIce() { return this.hasTurn ? 'stun+turn' : 'stun only (no TURN)'; }
  peersInfo() {
    const list = [...this.peers.values()].map((p) => p.info);
    // A tab served only through the room is still someone here (e.g. the presenter for the board).
    for (const m of this.presence) {
      if (this.roomPeers.has(m.tabId) && !list.some((i) => i.tabId === m.tabId)) list.push({ tabId: m.tabId, userId: m.userId, device: m.device });
    }
    return list;
  }
  remoteStream(tabId: string) { return this.peers.get(tabId)?.remoteStream ?? null; }

  onState(cb: Listener<Record<string, unknown>>) { this.stateListeners.add(cb); return () => { this.stateListeners.delete(cb); }; }
  onEvent(cb: Listener<Record<string, unknown>>) { this.eventListeners.add(cb); return () => { this.eventListeners.delete(cb); }; }
  onTrack(cb: (peer: PeerInfo, stream: MediaStream | null) => void) { this.trackListeners.add(cb); return () => { this.trackListeners.delete(cb); }; }
  onPeers(cb: (peers: PeerInfo[]) => void) { this.peerListeners.add(cb); return () => { this.peerListeners.delete(cb); }; }

  /** The office tells the others it is open: only such tabs get positions through the room. */
  setInOffice(on: boolean) {
    if (this.inOffice === on) return;
    this.inOffice = on;
    this.room.track({ userId: this.self.userId, device: this.self.device, office: on });
  }

  sendState(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const p of this.peers.values()) if (p.state?.readyState === 'open') p.state.send(data);
    // The office sends ~15 times a second; the room gets a changed position at most every
    // ROOM_STATE_MS and an unchanged one every ROOM_STATE_IDLE_MS.
    const now = Date.now();
    if (now - this.roomStateAt < (data === this.roomStateSent ? ROOM_STATE_IDLE_MS : ROOM_STATE_MS)) return;
    const to = this.roomTargets('state');
    if (!to.length) return;
    this.roomStateAt = now;
    this.roomStateSent = data;
    this.outState = msg;
    this.queueRoom(to);
  }

  sendEvent(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const p of this.peers.values()) if (p.events?.readyState === 'open') p.events.send(data);
    if (data.length > ROOM_BATCH_BYTES) return;
    let to = this.roomTargets('events');
    if (typeof msg.to === 'string') to = to.filter((t) => t === msg.to);
    if (!to.length) return;
    this.outEvents.push({ msg, size: data.length });
    this.queueRoom(to);
  }

  // Replaces the outgoing microphone track on every connection (no renegotiation needed).
  setLocalTrack(track: MediaStreamTrack | null) {
    this.localTrack = track;
    for (const p of this.peers.values()) {
      const sameUser = p.info.userId === this.self.userId;
      void p.sender?.replaceTrack(sameUser ? null : track);
    }
  }

  private async loadIce() {
    const { servers, ttl, ok } = await loadIceServers();
    const gained = servers.length > STUN.length && !this.hasTurn;
    this.ice = servers;
    this.hasTurn = servers.length > STUN.length;
    for (const p of this.peers.values()) {
      try { p.pc.setConfiguration({ ...p.pc.getConfiguration(), iceServers: servers }); } catch {}
      // A relay that just became available is tried at once on links that never connected.
      if (gained && p.pc.connectionState !== 'connected') { p.restarts = 0; p.restartAt = 0; this.maybeRestart(p); }
    }
    // Generated credentials expire: ask again halfway. A failed request is retried in a minute.
    const again = !ok ? 60_000 : ttl !== null ? Math.max(600, ttl / 2) * 1000 : null;
    if (again) setTimeout(() => { void this.loadIce(); }, again);
  }

  private maybeRestart(p: Peer) {
    const state = p.pc.connectionState;
    if (p.polite || state === 'closed' || state === 'connected' || Date.now() < p.restartAt) return;
    p.restarts++;
    p.restartAt = Date.now() + Math.min(RESTART_MAX_MS, RESTART_FIRST_MS * 2 ** p.restarts);
    p.pc.restartIce();
  }

  private emitPeers() { const list = this.peersInfo(); this.peerListeners.forEach((cb) => cb(list)); }

  private noteSeen(list: PresenceMeta[]) {
    const now = Date.now();
    const alive = new Set(list.map((m) => m.tabId));
    for (const id of this.seen.keys()) if (!alive.has(id)) this.seen.delete(id);
    for (const id of alive) if (!this.seen.has(id)) this.seen.set(id, now);
  }

  // Tabs that need the room for this kind of message: present for a while, and no open link.
  private roomTargets(kind: 'state' | 'events'): string[] {
    const now = Date.now();
    const out = new Set<string>();
    for (const m of this.presence) {
      if (m.tabId === this.self.tabId || out.has(m.tabId)) continue;
      if (kind === 'state' && !m.office) continue;
      if (linkOpen(this.peers.get(m.tabId), kind)) continue;
      if (now - (this.seen.get(m.tabId) ?? now) < FALLBACK_AFTER_MS) continue;
      out.add(m.tabId);
    }
    return [...out];
  }

  // A tab that just started to be served by the room is announced like a link that opened, so the
  // listeners send it their snapshots (doors, room lights, board, raised hands).
  private checkRoomPeers() {
    const now = new Set(this.roomTargets('events'));
    const added = [...now].some((t) => !this.roomPeers.has(t));
    this.roomPeers = now;
    if (added) this.emitPeers();
  }

  private queueRoom(to: string[]) {
    for (const t of to) this.outTo.add(t);
    this.outTimer ??= setTimeout(() => this.flushRoom(), ROOM_FLUSH_MS);
  }

  private flushRoom() {
    this.outTimer = null;
    const to = [...this.outTo];
    this.outTo.clear();
    let s = this.outState;
    this.outState = null;
    const events = this.outEvents.splice(0);
    if (!to.length) return;
    let batch: Record<string, unknown>[] = [];
    let size = s ? JSON.stringify(s).length : 0;
    const send = () => {
      this.room.send('mesh', { from: this.self.tabId, fromUser: this.self.userId, fromDevice: this.self.device, to, ...(s ? { s } : {}), e: batch });
      s = null; batch = []; size = 0;
    };
    for (const ev of events) {
      if ((batch.length || s) && size + ev.size > ROOM_BATCH_BYTES) send();
      batch.push(ev.msg);
      size += ev.size;
    }
    if (batch.length || s) send();
  }

  private onRoomMessage(msg: Record<string, unknown>) {
    if (!Array.isArray(msg.to) || !msg.to.includes(this.self.tabId)) return;
    const from = typeof msg.from === 'string' ? msg.from : '';
    if (!from || from === this.self.tabId || typeof msg.fromUser !== 'string') return;
    const peer = this.peers.get(from);
    const info: PeerInfo = peer?.info ?? { tabId: from, userId: msg.fromUser, device: msg.fromDevice === 'phone' ? 'phone' : 'computer' };
    // Positions from an open link are newer than the room's copy.
    if (msg.s && typeof msg.s === 'object' && !linkOpen(peer, 'state')) {
      const s = msg.s as Record<string, unknown>;
      this.stateListeners.forEach((cb) => cb(info, s, true));
    }
    if (Array.isArray(msg.e)) {
      for (const e of msg.e as unknown[]) {
        if (e && typeof e === 'object') this.eventListeners.forEach((cb) => cb(info, e as Record<string, unknown>, true));
      }
    }
  }

  private syncPeers(list: PresenceMeta[]) {
    this.presence = list;
    const alive = new Set(list.map((m) => m.tabId));
    for (const [tabId, p] of this.peers) {
      if (!alive.has(tabId)) { p.pc.close(); this.peers.delete(tabId); this.trackListeners.forEach((cb) => cb(p.info, null)); }
    }
    for (const m of list) {
      if (m.tabId === this.self.tabId || this.peers.has(m.tabId)) continue;
      // Lower tab id initiates; the other side waits for the offer.
      if (this.self.tabId < m.tabId) this.createPeer({ tabId: m.tabId, userId: m.userId, device: m.device }, true);
    }
    this.emitPeers();
  }

  private createPeer(info: PeerInfo, initiator: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const now = Date.now();
    const peer: Peer = {
      info, pc, state: null, events: null, sender: null, remoteStream: null, makingOffer: false, polite: !initiator,
      createdAt: now, restarts: 0, restartAt: now + RESTART_FIRST_MS, queue: Promise.resolve(), pendingIce: [],
    };
    this.peers.set(info.tabId, peer);
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = transceiver.sender;
    if (this.localTrack && info.userId !== this.self.userId) void peer.sender.replaceTrack(this.localTrack);
    const wire = (dc: RTCDataChannel) => {
      dc.onmessage = (e) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(e.data)); } catch { return; }
        (dc.label === 'state' ? this.stateListeners : this.eventListeners).forEach((cb) => cb(peer.info, msg));
      };
      if (dc.label === 'state') peer.state = dc; else peer.events = dc;
      // Listeners send their snapshots (doors, room, board) as soon as the channel can carry them.
      if (dc.readyState === 'open') this.emitPeers(); else dc.onopen = () => this.emitPeers();
    };
    if (initiator) {
      wire(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
      wire(pc.createDataChannel('events', { ordered: true }));
    }
    pc.ondatachannel = (e) => wire(e.channel);
    pc.ontrack = (e) => {
      peer.remoteStream = e.streams[0] ?? new MediaStream([e.track]);
      this.trackListeners.forEach((cb) => cb(peer.info, peer.remoteStream));
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.signal(info.tabId, { type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(info.tabId, { type: 'sdp', description: pc.localDescription!.toJSON() });
      } finally { peer.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') { peer.restarts = 0; peer.restartAt = Date.now() + RESTART_FIRST_MS; }
      if (state === 'failed' || state === 'disconnected') this.maybeRestart(peer);
      if (state === 'closed') this.peers.delete(info.tabId);
      this.emitPeers();
    };
    return peer;
  }

  private signal(to: string, payload: Record<string, unknown>) {
    this.room.send('rtc', { ...payload, to, from: this.self.tabId, fromUser: this.self.userId, fromDevice: this.self.device });
  }

  // "Perfect negotiation" pattern. Messages of one peer are processed in order: a candidate arriving
  // while the offer is still being applied used to be dropped, which left the link without a route.
  private onSignal(msg: Record<string, unknown>) {
    if (msg.to !== this.self.tabId) return Promise.resolve();
    const from = String(msg.from);
    let peer = this.peers.get(from);
    if (!peer) peer = this.createPeer({ tabId: from, userId: String(msg.fromUser), device: msg.fromDevice === 'phone' ? 'phone' : 'computer' }, false);
    const target = peer;
    target.queue = target.queue.then(() => this.handleSignal(target, msg));
    return target.queue;
  }

  private async handleSignal(peer: Peer, msg: Record<string, unknown>) {
    const { pc } = peer;
    const from = peer.info.tabId;
    try {
      if (msg.type === 'sdp') {
        const description = msg.description as RTCSessionDescriptionInit;
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        if (collision && !peer.polite) return;
        await pc.setRemoteDescription(description);
        for (const c of peer.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.signal(from, { type: 'sdp', description: pc.localDescription!.toJSON() });
        }
      } else if (msg.type === 'ice') {
        const candidate = msg.candidate as RTCIceCandidateInit;
        if (!pc.remoteDescription) peer.pendingIce.push(candidate);
        else await pc.addIceCandidate(candidate).catch(() => {});
      }
    } catch {
      // A failed negotiation step is retried by the next presence sync or ICE restart.
    }
  }
}

let mesh: Mesh | null = null;
// Browser-only singleton; the device kind can be refined after hydration.
export function getMesh(userId: string, device: 'phone' | 'computer'): Mesh | null {
  if (typeof window === 'undefined') return null;
  mesh ??= new Mesh(userId, device);
  mesh.self.device = device;
  return mesh;
}
