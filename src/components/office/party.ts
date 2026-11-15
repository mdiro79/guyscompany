'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';

// The conference room as a party room (owner request), the same for everyone in it:
// - the main screen slides down into its cabinet and back up;
// - party mode: a hatch in the ceiling opens, the table and chairs (tucked in) rise into it, the hatch
//   closes and the party rig comes down (disco ball, moving lights, lasers, an LED dance floor); off
//   plays it all backwards;
// - music: one of the built-in party tracks or a song a member added, started at a shared moment;
// - the light show's settings (ceiling lights, colours, mode, ball, beams, lasers, floor, strobe…).
// Like the room's lights and the jukebox it travels over the WebRTC events channel (newest change wins,
// late joiners catch up from whoever is there) and is not stored: the party ends when everyone leaves.

export type LightMode = 'beat' | 'rainbow' | 'chase' | 'calm' | 'strobe';
export const LIGHT_MODES: LightMode[] = ['beat', 'rainbow', 'chase', 'calm', 'strobe'];
export interface PartyLights { main: boolean; color: boolean; ball: boolean; heads: boolean; lasers: boolean; floor: boolean; strobe: boolean; jump: boolean; mode: LightMode; intensity: number; speed: number }
export interface Song { fileId: string; name: string }
export type Track = { kind: 'style'; style: number } | { kind: 'song'; fileId: string; name: string };
export interface PartyState {
  on: boolean; at: number; // party mode and the moment its animation (up or down) started
  tvDown: boolean; tvAt: number;
  track: Track | null; startedAt: number; // what plays (null: nothing) and since when, on the shared clock
  songs: Song[];
  lights: PartyLights;
}

export const LIGHTS_DEFAULT: PartyLights = { main: false, color: true, ball: true, heads: true, lasers: true, floor: true, strobe: false, jump: true, mode: 'beat', intensity: 80, speed: 55 };
const EMPTY: PartyState = { on: false, at: 0, tvDown: false, tvAt: 0, track: null, startedAt: 0, songs: [], lights: LIGHTS_DEFAULT };
export const PARTY_STYLES = 4; // built-in tracks (see partyAudio.ts)
const MAX_SONGS = 30;

// ——— The party mode's moves, in seconds ———
export const STAGE = { open: 1.4, tuck: 0.9, lift: 2.6, close: 1.3, rig: 1.8 };
export const PARTY_TOTAL = STAGE.open + STAGE.tuck + STAGE.lift + STAGE.close + STAGE.rig;
export const TV_SECONDS = 2.4;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How far along the party moves are at `now` (each 0…1): hatch open, chairs tucked, furniture up, rig down. */
export function partyPhase(s: Pick<PartyState, 'on' | 'at'>, now: number) {
  if (!s.at) return { hatch: 0, tuck: 0, lift: 0, rig: 0, progress: 0 };
  const el = Math.max(0, (now - s.at) / 1000);
  // Going up the moves run forwards; coming back the same moves run backwards.
  const t = s.on ? Math.min(PARTY_TOTAL, el) : Math.max(0, PARTY_TOTAL - el);
  if (t >= PARTY_TOTAL - 1e-6) return { hatch: 0, tuck: 1, lift: 1, rig: 1, progress: 1 };
  const a = STAGE.open, b = a + STAGE.tuck, c = b + STAGE.lift, d = c + STAGE.close;
  const hatch = t < a ? t / a : t < c ? 1 : t < d ? 1 - (t - c) / STAGE.close : 0;
  return { hatch: clamp01(hatch), tuck: clamp01((t - a) / STAGE.tuck), lift: clamp01((t - b) / STAGE.lift), rig: clamp01((t - d) / STAGE.rig), progress: t / PARTY_TOTAL };
}
/** How far down the main screen is (0 up … 1 hidden). */
export function tvPhase(s: Pick<PartyState, 'tvDown' | 'tvAt'>, now: number) {
  if (!s.tvAt) return s.tvDown ? 1 : 0;
  const k = clamp01((now - s.tvAt) / 1000 / TV_SECONDS);
  return s.tvDown ? k : 1 - k;
}
/** Furniture away (or on its way): no sitting at the table and nothing to bump into in the middle. */
export const floorTaken = (s: Pick<PartyState, 'on' | 'at'>, now: number) => s.on || partyPhase(s, now).lift > 0;

// The clock the party's moves follow: the shared one, or a fixed moment for screenshot scripts.
let frozen: number | null = null;
export const partyNow = () => frozen ?? syncedNow();
if (typeof window !== 'undefined') {
  // Test hook: show the party moves `sec` seconds after starting (null: live again).
  (window as unknown as { __gcPartyAt?: (sec: number | null) => void }).__gcPartyAt = (sec) => {
    if (sec === null) { frozen = null; return; }
    const now = syncedNow();
    state = { ...state, on: true, at: now - 1, t: state.t + 1 };
    frozen = now - 1 + sec * 1000;
    listeners.forEach((l) => l());
  };
}

// ——— Shared state ———
let state: PartyState & { t: number } = { ...EMPTY, t: 0 };
const listeners = new Set<() => void>();
let mesh: Mesh | null = null;
const emit = () => listeners.forEach((l) => l());

function accept(next: PartyState, t: number) {
  if (t <= state.t) return false;
  state = { ...next, t };
  emit();
  return true;
}
const send = () => mesh?.sendEvent({ type: 'party', s: { ...strip(state) }, t: state.t });
const strip = (s: PartyState & { t?: number }): PartyState => ({ on: s.on, at: s.at, tvDown: s.tvDown, tvAt: s.tvAt, track: s.track, startedAt: s.startedAt, songs: s.songs, lights: s.lights });

function change(fn: (s: PartyState, now: number) => PartyState) {
  const now = syncedNow();
  if (accept(fn(strip(state), now), Math.max(now, state.t + 1))) send();
}

export const party = {
  get: (): PartyState => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  /** Party mode on or off; a change in the middle of the moves turns them around from where they are. */
  setOn(on: boolean) {
    change((s, now) => {
      if (s.on === on) return s;
      const p = partyPhase(s, now).progress; // 0…1 of the way up
      const done = on ? p : 1 - p; // how much of the new direction is already behind us
      return { ...s, on, at: now - done * PARTY_TOTAL * 1000 };
    });
  },
  setTvDown(down: boolean) {
    change((s, now) => {
      if (s.tvDown === down) return s;
      const k = tvPhase(s, now), done = down ? k : 1 - k;
      return { ...s, tvDown: down, tvAt: now - done * TV_SECONDS * 1000 };
    });
  },
  play(track: Track | null) { change((s, now) => ({ ...s, track, startedAt: now })); },
  addSong(song: Song) {
    change((s, now) => ({ ...s, songs: [song, ...s.songs.filter((x) => x.fileId !== song.fileId)].slice(0, MAX_SONGS), track: { kind: 'song', ...song }, startedAt: now }));
  },
  setLights(patch: Partial<PartyLights>) { change((s) => ({ ...s, lights: { ...s.lights, ...patch } })); },
};

export function useParty(): PartyState {
  return useSyncExternalStore(party.subscribe, party.get, party.get);
}

// ——— What arrives from others ———
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);
const fileId = (v: unknown) => { const s = text(v, 64); return s && /^[\w-]+$/.test(s) ? s : null; };

export function cleanParty(v: unknown): PartyState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const l = (o.lights && typeof o.lights === 'object' ? o.lights : {}) as Record<string, unknown>;
  const lights: PartyLights = {
    main: bool(l.main, LIGHTS_DEFAULT.main), color: bool(l.color, true), ball: bool(l.ball, true), heads: bool(l.heads, true), lasers: bool(l.lasers, true),
    floor: bool(l.floor, true), strobe: bool(l.strobe, false), jump: bool(l.jump, true), mode: LIGHT_MODES.includes(l.mode as LightMode) ? (l.mode as LightMode) : 'beat',
    intensity: num(l.intensity, 0, 100, 80), speed: num(l.speed, 0, 100, 55),
  };
  let track: Track | null = null;
  const tr = o.track as Record<string, unknown> | null | undefined;
  if (tr && tr.kind === 'style' && Number.isInteger(tr.style) && (tr.style as number) >= 0 && (tr.style as number) < PARTY_STYLES) track = { kind: 'style', style: tr.style as number };
  else if (tr && tr.kind === 'song' && fileId(tr.fileId)) track = { kind: 'song', fileId: fileId(tr.fileId)!, name: text(tr.name, 120) ?? '♪' };
  const songs = Array.isArray(o.songs) ? o.songs.flatMap((x) => { const r = x as Record<string, unknown>; const id = fileId(r?.fileId); return id ? [{ fileId: id, name: text(r.name, 120) ?? '♪' }] : []; }).slice(0, MAX_SONGS) : [];
  return {
    on: bool(o.on, false), at: num(o.at, 0, 1e15, 0), tvDown: bool(o.tvDown, false), tvAt: num(o.tvAt, 0, 1e15, 0),
    track, startedAt: num(o.startedAt, 0, 1e15, 0), songs, lights,
  };
}

export function connectParty(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => {
    if (msg.type !== 'party' || typeof msg.t !== 'number') return;
    const s = cleanParty(msg.s);
    if (s) accept(s, msg.t);
  });
  const offPeers = m.onPeers(() => setTimeout(() => { if (state.t > 0) send(); }, 1100));
  return () => { off(); offPeers(); mesh = null; };
}
