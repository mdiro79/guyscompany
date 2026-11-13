'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { JUKEBOX, GAME, HALL, type Vec2 } from '../layout';
import { music, STYLES } from './music';

// The jukebox in the game room: which style plays is the same for everyone (newest choice wins, sent
// over the WebRTC events channel, late joiners catch up from whoever is there). The sound itself is made
// on each device and gets quieter with the distance to the game room. Nothing is stored.

export const TRACKS = ['lofi', 'synth', 'calm', 'party'] as const;
const MUTE_KEY = 'gc-music-off';

let state = { track: -1, t: 0 };
let muted = false;
let mesh: Mesh | null = null;
let listener: Vec2 | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

try { muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }

function volumeAt(p: Vec2) {
  const inRoom = p[0] > GAME.min[0] && p[0] < GAME.max[0] && p[1] > HALL.min[1] && p[1] < GAME.max[1]; // the game room and the arcade hall behind it
  if (inRoom) return 0.5;
  const d = Math.hypot(p[0] - JUKEBOX[0], p[1] - JUKEBOX[1]);
  return 0.3 * Math.max(0, Math.min(1, 1 - (d - 6) / 12));
}

// Starts, stops and fades the sound for this device from the shared state, the mute switch and where the listener stands.
function apply() {
  const v = state.track >= 0 && !muted && listener ? volumeAt(listener) : 0;
  const m = music();
  if (v > 0.004) { m.play(STYLES[state.track]); m.setVolume(v); }
  else if (m.playing) m.stop();
}

function accept(track: number, t: number) {
  if (t <= state.t || !Number.isInteger(track) || track < -1 || track >= TRACKS.length) return false;
  state = { track, t };
  apply();
  emit();
  return true;
}

export const jukebox = {
  get: () => state.track,
  playing: () => state.track >= 0,
  muted: () => muted,
  set(track: number) {
    if (accept(track, Math.max(syncedNow(), state.t + 1))) mesh?.sendEvent({ type: 'juke', track, t: state.t });
  },
  setMuted(on: boolean) {
    muted = on;
    try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    apply(); emit();
  },
  /** Where this device's listener stands (null when leaving the office: the music stops). */
  listen(pos: Vec2 | null) { listener = pos; apply(); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

const snapshot = () => `${state.track}:${muted}`;
export function useJukebox() {
  useSyncExternalStore(jukebox.subscribe, snapshot, snapshot);
  return { track: state.track, muted };
}

export function connectJukebox(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => { if (msg.type === 'juke' && typeof msg.track === 'number' && typeof msg.t === 'number') accept(msg.track, msg.t); });
  const offPeers = m.onPeers(() => setTimeout(() => { if (state.t > 0) m.sendEvent({ type: 'juke', track: state.track, t: state.t }); }, 900));
  return () => { off(); offPeers(); mesh = null; jukebox.listen(null); };
}
