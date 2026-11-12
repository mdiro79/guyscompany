'use client';
import { getRoom, type PresenceMeta, type Room } from './room';

// Peer-to-peer mesh between all open tabs of the team (4 people → at most a handful of links).
// Data channels carry high-rate state (position, emotes); audio rides on the same connections.
// Supabase Realtime (or BroadcastChannel in demo) is only used for signaling.

export interface PeerInfo { tabId: string; userId: string; device: 'phone' | 'computer' }
type Listener<T> = (from: PeerInfo, msg: T) => void;

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
  // Signals are handled one at a time, and candidates wait for the remote description.
  queue: Promise<void>;
  pendingIce: RTCIceCandidateInit[];
  rtt: number; // smoothed round trip in ms (-1 until measured)
  lastSeen: number; // when anything last arrived on a data channel
  downSince: number; // since when the link has not been connected (0 while it is)
}

// How a teammate's link is doing, for the people list in the office.
export interface LinkInfo { userId: string; tabId: string; device: 'phone' | 'computer'; state: 'connected' | 'connecting' | 'lost'; rtt: number }

const PING_MS = 2500;
const STATE_BUFFER_LIMIT = 16 * 1024; // a pose that would queue behind this much is dropped (a newer one follows)
const REBUILD_AFTER_MS = 30000; // a link that stays down this long is thrown away and built again

const ICE_REFRESH_MS = 6 * 60 * 60 * 1000; // well inside the 24 h lifetime of relay credentials

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

// STUN plus the optional TURN relay, which the server hands out (see /api/turn).
async function loadIceServers(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch('/api/turn', { cache: 'no-store' });
    const { servers } = (await r.json()) as { servers: RTCIceServer[] };
    return [...STUN, ...servers];
  } catch { return STUN; }
}

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
  private ready: Promise<void>;

  constructor(userId: string, device: 'phone' | 'computer') {
    this.room = getRoom();
    this.self = { tabId: this.room.tabId, userId, device };
    // Links are only created once the relay settings are known, so the first connection already has them.
    this.ready = loadIceServers().then((servers) => { this.ice = servers; });
    // Relay credentials are temporary (24 h): fetch fresh ones regularly and hand them to existing links,
    // which use them on their next ICE restart.
    setInterval(() => {
      void loadIceServers().then((servers) => {
        this.ice = servers;
        for (const p of this.peers.values()) { try { p.pc.setConfiguration({ ...p.pc.getConfiguration(), iceServers: servers }); } catch { /* closed */ } }
      });
    }, ICE_REFRESH_MS);
    this.room.on('rtc', (msg) => { void this.ready.then(() => this.onSignal(msg)); });
    this.room.onPresence((list) => { this.presence = list; void this.ready.then(() => this.syncPeers(list)); });
    // Stuck links (never connected, or dropped) get an ICE restart instead of staying silent forever.
    setInterval(() => {
      const now = Date.now();
      for (const p of [...this.peers.values()]) {
        const state = p.pc.connectionState;
        if (state === 'connected') { p.downSince = 0; continue; }
        if (state === 'closed') continue;
        p.downSince ||= now;
        // Restarting ICE did not help for a long while: start over with a fresh connection.
        if (!p.polite && now - p.downSince > REBUILD_AFTER_MS) { this.rebuild(p); continue; }
        if (now - p.createdAt > 15000 && !p.polite) p.pc.restartIce();
      }
    }, 8000);
    // Round-trip time of every link (shown in the office's people list).
    setInterval(() => {
      const data = JSON.stringify({ type: '__ping', t: performance.now() });
      for (const p of this.peers.values()) if (p.events?.readyState === 'open') p.events.send(data);
    }, PING_MS);
    // Back from the background or from a network change: do not wait for the next check.
    const revive = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      for (const p of this.peers.values()) if (p.pc.connectionState !== 'connected' && p.pc.connectionState !== 'closed' && !p.polite) p.pc.restartIce();
    };
    if (typeof window !== 'undefined') { window.addEventListener('online', revive); document.addEventListener('visibilitychange', revive); }
  }

  /** Every link of the mesh with its state and round-trip time. */
  links(): LinkInfo[] {
    return [...this.peers.values()].map((p) => ({
      userId: p.info.userId, tabId: p.info.tabId, device: p.info.device, rtt: Math.round(p.rtt),
      state: p.pc.connectionState === 'connected' && p.state?.readyState === 'open' ? 'connected' : p.downSince && Date.now() - p.downSince > 12000 ? 'lost' : 'connecting',
    }));
  }

  // Closes a dead link on both sides and, as the initiator, builds a new one (new ICE candidates, relay included).
  private rebuild(p: Peer) {
    this.signal(p.info.tabId, { type: 'reset' });
    this.drop(p);
    if (this.presence.some((m) => m.tabId === p.info.tabId)) this.createPeer(p.info, true);
    this.emitPeers();
  }

  private drop(p: Peer) {
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    if (this.peers.get(p.info.tabId) === p) this.peers.delete(p.info.tabId);
    this.trackListeners.forEach((cb) => cb(p.info, null));
  }

  get presenceList() { return this.presence; }
  debugLinks() { return [...this.peers.values()].map((p) => `${p.info.userId.slice(0, 4)}:${p.pc.connectionState}/${p.pc.iceConnectionState}`); }
  peersInfo() { return [...this.peers.values()].map((p) => p.info); }
  remoteStream(tabId: string) { return this.peers.get(tabId)?.remoteStream ?? null; }

  onState(cb: Listener<Record<string, unknown>>) { this.stateListeners.add(cb); return () => { this.stateListeners.delete(cb); }; }
  onEvent(cb: Listener<Record<string, unknown>>) { this.eventListeners.add(cb); return () => { this.eventListeners.delete(cb); }; }
  onTrack(cb: (peer: PeerInfo, stream: MediaStream | null) => void) { this.trackListeners.add(cb); return () => { this.trackListeners.delete(cb); }; }
  onPeers(cb: (peers: PeerInfo[]) => void) { this.peerListeners.add(cb); return () => { this.peerListeners.delete(cb); }; }

  sendState(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const p of this.peers.values()) if (p.state?.readyState === 'open' && p.state.bufferedAmount < STATE_BUFFER_LIMIT) p.state.send(data);
  }

  sendEvent(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const p of this.peers.values()) if (p.events?.readyState === 'open') p.events.send(data);
  }

  // Replaces the outgoing microphone track on every connection (no renegotiation needed).
  setLocalTrack(track: MediaStreamTrack | null) {
    this.localTrack = track;
    for (const p of this.peers.values()) {
      const sameUser = p.info.userId === this.self.userId;
      void p.sender?.replaceTrack(sameUser ? null : track);
    }
  }

  private emitPeers() { const list = this.peersInfo(); this.peerListeners.forEach((cb) => cb(list)); }

  private syncPeers(list: PresenceMeta[]) {
    this.presence = list;
    const alive = new Set(list.map((m) => m.tabId));
    for (const [tabId, p] of this.peers) {
      if (!alive.has(tabId)) this.drop(p);
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
    const peer: Peer = { info, pc, state: null, events: null, sender: null, remoteStream: null, makingOffer: false, polite: !initiator, createdAt: Date.now(), queue: Promise.resolve(), pendingIce: [], rtt: -1, lastSeen: 0, downSince: 0 };
    this.peers.set(info.tabId, peer);
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = transceiver.sender;
    if (this.localTrack && info.userId !== this.self.userId) void peer.sender.replaceTrack(this.localTrack);
    const wire = (dc: RTCDataChannel) => {
      dc.onmessage = (e) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(e.data)); } catch { return; }
        peer.lastSeen = Date.now();
        // Round-trip measurement stays inside the mesh.
        if (msg.type === '__ping') { if (dc.readyState === 'open') dc.send(JSON.stringify({ type: '__pong', t: msg.t })); return; }
        if (msg.type === '__pong') {
          const rtt = performance.now() - Number(msg.t);
          if (rtt >= 0 && rtt < 60000) peer.rtt = peer.rtt < 0 ? rtt : peer.rtt + (rtt - peer.rtt) * 0.3;
          return;
        }
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') pc.restartIce();
      if (pc.connectionState === 'closed') this.peers.delete(info.tabId);
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
    // The other side gave up on this link and is about to build a new one.
    if (msg.type === 'reset') { if (peer) { this.drop(peer); this.emitPeers(); } return Promise.resolve(); }
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
  (window as unknown as { __gcMesh?: Mesh }).__gcMesh = mesh; // for the test scripts and the debug badge
  mesh.self.device = device;
  return mesh;
}
