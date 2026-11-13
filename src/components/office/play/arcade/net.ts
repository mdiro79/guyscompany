'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { isGameId, type GameId } from '@/lib/arcade';
import { newSeed } from './kit/rng';

// Playing together in the game room, over the WebRTC links the office already has (nothing is stored).
// A "room" is one table: a head-to-head match or a race on a solo game. Its host invites; teammates in
// the office see the invitation and join. The room travels as a whole snapshot and the newest one wins:
// in a lobby only the host changes it, in a match only the player whose turn it is (bots are moved by
// one of the people at the table), so two changes hardly ever meet. Someone who connects late gets the
// current snapshot. A player who leaves or loses the connection is replaced by the computer.

export type Seat = { k: 'human'; id: string } | { k: 'bot' } | { k: 'local' } | { k: 'open' };
export interface Room {
  id: string; game: GameId; mode: 'race' | 'match'; host: string;
  seats: Seat[];
  status: 'lobby' | 'play' | 'done' | 'closed';
  seed: number; startAt: number; round: number;
  state: unknown; // the game's own state (see rules/); a real-time game keeps only its result here
  seq: number; t: number;
  grow?: boolean; // anyone may still sit down while it gathers: the table gets another seat
}
export interface Live { score: number; done: boolean }
export interface NetState { rooms: Room[]; mine: Room | null; live: Record<string, Live>; joining: string | null }

const MAX_RACERS = 6, GONE_MS = 8000, JOIN_TIMEOUT_MS = 5000;

let me = '';
let mesh: Mesh | null = null;
const rooms = new Map<string, Room>();
let mineId: string | null = null;
let joining: string | null = null;
let joinTimer: ReturnType<typeof setTimeout> | null = null;
const live = new Map<string, Map<string, Live & { round: number }>>();
const dismissed = new Set<string>();
const lastSeen = new Map<string, number>(); // userId → when a link to them was last up
const left = new Map<string, Set<string>>(); // roomId → members who said they left
const listeners = new Set<() => void>();
const fastListeners = new Set<(from: string, m: Record<string, unknown>) => void>();
const msgListeners = new Set<(from: string, m: Record<string, unknown>) => void>();
let snap: NetState = { rooms: [], mine: null, live: {}, joining: null };

function emit() {
  const mine = mineId ? rooms.get(mineId) ?? null : null;
  const scores: Record<string, Live> = {};
  if (mine) for (const [id, l] of live.get(mine.id) ?? []) if (l.round === mine.round) scores[id] = { score: l.score, done: l.done };
  snap = { rooms: [...rooms.values()], mine, live: scores, joining };
  listeners.forEach((l) => l());
}

const humans = (r: Room) => r.seats.flatMap((s) => (s.k === 'human' ? [s.id] : []));
const hasMe = (r: Room) => humans(r).includes(me);
/** Nobody else is (or can be) at the table: nothing needs to be sent. */
const isLocal = (r: Room) => r.seats.every((s) => s.k !== 'open' && (s.k !== 'human' || s.id === me)) && r.mode === 'match' && !(r.grow && r.status === 'lobby');
const send = (r: Room) => { if (!isLocal(r)) mesh?.sendEvent({ type: 'ar-room', room: r }); };

function validRoom(x: unknown): x is Room {
  const r = x as Room;
  return !!r && typeof r.id === 'string' && r.id.length <= 40 && isGameId(r.game) && (r.mode === 'race' || r.mode === 'match') && typeof r.host === 'string'
    && Array.isArray(r.seats) && r.seats.length >= 1 && r.seats.length <= MAX_RACERS
    && r.seats.every((s) => s && (s.k === 'bot' || s.k === 'local' || s.k === 'open' || (s.k === 'human' && typeof s.id === 'string')))
    && ['lobby', 'play', 'done', 'closed'].includes(r.status) && [r.seed, r.startAt, r.round, r.seq, r.t].every((n) => typeof n === 'number' && Number.isFinite(n));
}

function accept(from: PeerInfo, r: Room) {
  const cur = rooms.get(r.id);
  // Only people of the room speak for it (the host alone while it gathers).
  const voice = cur ?? r;
  if (from.userId !== voice.host && !(voice.status !== 'lobby' && humans(voice).includes(from.userId))) return;
  if (cur && !(r.seq > cur.seq || (r.seq === cur.seq && r.t > cur.t))) return;
  if (r.status === 'closed') {
    rooms.delete(r.id); live.delete(r.id); left.delete(r.id);
    if (mineId === r.id) mineId = null;
    if (joining === r.id) stopJoining();
    emit();
    return;
  }
  rooms.set(r.id, r);
  if (joining === r.id && hasMe(r)) { mineId = r.id; stopJoining(); }
  // Put out of the room by the host (or it was reset without me).
  if (mineId === r.id && !hasMe(r)) mineId = null;
  emit();
}

function stopJoining() { joining = null; if (joinTimer) clearTimeout(joinTimer); joinTimer = null; }

function commit(patch: Partial<Room>) {
  const cur = mineId ? rooms.get(mineId) : null;
  if (!cur) return null;
  const next: Room = { ...cur, ...patch, seq: cur.seq + 1, t: Math.max(syncedNow(), cur.t + 1) };
  rooms.set(next.id, next);
  send(next);
  emit();
  return next;
}

const present = (userId: string) => userId === me || (mesh?.peersInfo().some((p) => p.userId === userId) ?? false);
/** A member who said goodbye, or whose link has been down for a while. */
function gone(r: Room, userId: string) {
  if (userId === me) return false;
  if (left.get(r.id)?.has(userId)) return true;
  if (present(userId)) return false;
  return Date.now() - (lastSeen.get(userId) ?? 0) > GONE_MS;
}

export const arcadeNet = {
  get: () => snap,
  me: () => me,
  present, gone,
  humans,
  /** Other people can be reached right now (teammates in the app with a working link). */
  othersOnline: () => (mesh ? [...new Set(mesh.peersInfo().map((p) => p.userId))].filter((id) => id !== me) : []),
  /** Rooms I could join: still gathering, hosted by someone who is here. */
  invites: () => snap.rooms.filter((r) => r.status === 'lobby' && r.host !== me && !hasMe(r) && !dismissed.has(r.id) && present(r.host)
    && (r.mode === 'race' || r.grow ? r.seats.length < MAX_RACERS : r.seats.some((s) => s.k === 'open'))),
  dismiss(id: string) { dismissed.add(id); emit(); },

  /** Opens a table. A match against the computer or on one device starts at once; otherwise it gathers players first. */
  host(game: GameId, mode: Room['mode'], seats: Seat[], state: unknown = null, grow = false): Room {
    arcadeNet.leave();
    const waiting = mode === 'race' || grow || seats.some((s) => s.k === 'open');
    const r: Room = { id: crypto.randomUUID(), game, mode, host: me, seats, status: waiting ? 'lobby' : 'play', seed: newSeed(), startAt: syncedNow(), round: waiting ? 0 : 1, state, seq: 1, t: syncedNow(), grow: grow || undefined };
    rooms.set(r.id, r); mineId = r.id;
    send(r); emit();
    return r;
  },
  join(id: string) {
    const r = rooms.get(id);
    if (!r || !mesh) return;
    arcadeNet.leave();
    joining = id;
    mesh.sendEvent({ type: 'ar-join', id }, (p) => p.userId === r.host);
    if (joinTimer) clearTimeout(joinTimer);
    joinTimer = setTimeout(() => { if (joining === id) { stopJoining(); emit(); } }, JOIN_TIMEOUT_MS);
    emit();
  },
  leave() {
    stopJoining();
    const r = mineId ? rooms.get(mineId) : null;
    if (!r) { mineId = null; return; }
    if (r.host === me && (r.status === 'lobby' || humans(r).length <= 1)) {
      // The host closes a table that is still gathering, or one where nobody else sits.
      const closed = commit({ status: 'closed' });
      if (closed) rooms.delete(closed.id);
    } else if (!isLocal(r)) mesh?.sendEvent({ type: 'ar-leave', id: r.id });
    else rooms.delete(r.id);
    live.delete(r.id);
    mineId = null;
    emit();
  },
  /** Host, while gathering: what a seat is (open for a teammate, the computer, a second player on this device). */
  setSeat(i: number, seat: Seat) {
    const r = snap.mine;
    if (!r || r.host !== me || r.status !== 'lobby' || i <= 0 || i >= r.seats.length) return;
    commit({ seats: r.seats.map((s, j) => (j === i ? seat : s)) });
  },
  /** Host of a growing table, while gathering: one more seat for the computer, or one seat fewer. */
  addBot() { const r = snap.mine; if (r && r.grow && r.host === me && r.status === 'lobby' && r.seats.length < MAX_RACERS) commit({ seats: [...r.seats, { k: 'bot' }] }); },
  dropSeat(i: number) { const r = snap.mine; if (r && r.grow && r.host === me && r.status === 'lobby' && i > 0 && r.seats[i] && r.seats[i].k !== 'human') commit({ seats: r.seats.filter((_, j) => j !== i) }); },
  /** Host: begins the match or the race. `state` is the match's first position. */
  start(state: unknown = null) {
    const r = snap.mine;
    if (!r || r.host !== me) return;
    live.delete(r.id); left.delete(r.id);
    const seats = r.mode === 'race' ? r.seats.filter((s) => s.k === 'human' && !gone(r, s.id)) : r.grow ? r.seats.filter((s) => s.k !== 'open') : r.seats;
    commit({ status: 'play', seats, seed: newSeed(), startAt: syncedNow() + (r.mode === 'race' ? 3800 : 0), round: r.round + 1, state });
  },
  /** A move was made: the match's new position (and whether that ends it). */
  setState(state: unknown, done: boolean) { commit({ state, status: done ? 'done' : 'play' }); },
  /** The computer takes over a seat. */
  botSeat(i: number) {
    const r = snap.mine;
    if (!r || !r.seats[i] || r.seats[i].k !== 'human') return;
    commit({ seats: r.seats.map((s, j): Seat => (j === i ? { k: 'bot' } : s)) });
  },
  finishRace() { const r = snap.mine; if (r && r.mode === 'race' && r.status === 'play') commit({ status: 'done' }); },

  /** My running score in a race. */
  postScore(score: number, done: boolean) {
    const r = snap.mine;
    if (!r || r.mode !== 'race') return;
    if (!live.has(r.id)) live.set(r.id, new Map());
    live.get(r.id)!.set(me, { score, done, round: r.round });
    mesh?.sendEvent({ type: 'ar-score', id: r.id, round: r.round, score, done });
    emit();
  },

  // Real-time games: quick messages that may get lost (positions) and reliable ones (goals, the result).
  sendFast(m: Record<string, unknown>) { if (mineId) mesh?.sendState({ k: 'ar', id: mineId, m }); },
  sendMsg(m: Record<string, unknown>) { if (mineId) mesh?.sendEvent({ type: 'ar-msg', id: mineId, m }); },
  onFast(cb: (from: string, m: Record<string, unknown>) => void) { fastListeners.add(cb); return () => { fastListeners.delete(cb); }; },
  onMsg(cb: (from: string, m: Record<string, unknown>) => void) { msgListeners.add(cb); return () => { msgListeners.delete(cb); }; },

  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useArcadeNet = () => useSyncExternalStore(arcadeNet.subscribe, arcadeNet.get, arcadeNet.get);

export function connectArcadeNet(m: Mesh | null, userId: string) {
  mesh = m; me = userId;
  if (!m) return () => {};
  const offEvent = m.onEvent((from, msg) => {
    if (from.userId === me) return; // my other device
    if (msg.type === 'ar-room' && validRoom(msg.room)) { accept(from, msg.room); return; }
    const r = typeof msg.id === 'string' ? rooms.get(msg.id) : undefined;
    if (!r) return;
    if (msg.type === 'ar-join') {
      if (r.host !== me || mineId !== r.id || humans(r).includes(from.userId)) return;
      if (r.mode === 'race') {
        if ((r.status === 'lobby' || r.status === 'done') && r.seats.length < MAX_RACERS) commit({ seats: [...r.seats, { k: 'human', id: from.userId }], status: 'lobby' });
      } else if (r.status === 'lobby') {
        const i = r.seats.findIndex((s) => s.k === 'open');
        if (i >= 0) commit({ seats: r.seats.map((s, j): Seat => (j === i ? { k: 'human', id: from.userId } : s)) });
        else if (r.grow && r.seats.length < MAX_RACERS) commit({ seats: [...r.seats, { k: 'human', id: from.userId }] });
      }
    } else if (msg.type === 'ar-leave') {
      if (!humans(r).includes(from.userId)) return;
      if (r.status === 'lobby' && r.host === me && mineId === r.id) {
        commit({ seats: r.mode === 'race' ? r.seats.filter((s) => !(s.k === 'human' && s.id === from.userId)) : r.seats.map((s): Seat => (s.k === 'human' && s.id === from.userId ? { k: 'open' } : s)) });
      } else {
        if (!left.has(r.id)) left.set(r.id, new Set());
        left.get(r.id)!.add(from.userId);
        emit();
      }
    } else if (msg.type === 'ar-score') {
      if (!humans(r).includes(from.userId) || typeof msg.score !== 'number' || !Number.isFinite(msg.score) || typeof msg.round !== 'number') return;
      if (!live.has(r.id)) live.set(r.id, new Map());
      live.get(r.id)!.set(from.userId, { score: Math.max(0, Math.floor(msg.score)), done: msg.done === true, round: msg.round });
      if (mineId === r.id) emit();
    } else if (msg.type === 'ar-msg') {
      if (mineId === r.id && humans(r).includes(from.userId) && msg.m && typeof msg.m === 'object') msgListeners.forEach((cb) => cb(from.userId, msg.m as Record<string, unknown>));
    }
  });
  const offState = m.onState((from, msg) => {
    if (msg.k !== 'ar' || msg.id !== mineId || from.userId === me || !msg.m || typeof msg.m !== 'object') return;
    fastListeners.forEach((cb) => cb(from.userId, msg.m as Record<string, unknown>));
  });
  // A new link: whoever sits at a table (or hosts one) sends it the current snapshot.
  const offPeers = m.onPeers((peers) => {
    const now = Date.now();
    for (const p of peers) lastSeen.set(p.userId, now);
    setTimeout(() => { const r = mineId ? rooms.get(mineId) : null; if (r) send(r); }, 1200);
    emit();
  });
  // Housekeeping: links that are up count as seen; tables whose host is gone and that I am not at disappear.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const p of m.peersInfo()) lastSeen.set(p.userId, now);
    let changed = false;
    for (const r of rooms.values()) if (r.id !== mineId && (gone(r, r.host) || now - r.t > 6 * 3600_000)) { rooms.delete(r.id); live.delete(r.id); left.delete(r.id); changed = true; }
    if (changed || mineId) emit();
  }, 2500);
  return () => { offEvent(); offState(); offPeers(); clearInterval(sweep); arcadeNet.leave(); mesh = null; };
}
