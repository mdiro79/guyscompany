'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import type { RoomSettings } from '@/lib/data/types';

// The conference room's light and glass as everyone sees them. A change from the wall panel applies at
// once, travels to the others over the WebRTC events channel (newest wins, throttled while a slider moves)
// and is saved to the database after a pause, so people arriving later get it too.

export const ROOM_DEFAULT: RoomSettings = { light: 100, warmth: 40, frost: 0 };
const BROADCAST_MS = 80;

let state: RoomSettings & { t: number } = { ...ROOM_DEFAULT, t: 0 };
const listeners = new Set<() => void>();
let mesh: Mesh | null = null;
let lastSent = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

const valid = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100;

function apply(next: Partial<RoomSettings>, t: number) {
  if (t <= state.t) return false;
  state = { ...state, ...next, t };
  listeners.forEach((l) => l());
  return true;
}

const send = () => { lastSent = Date.now(); pending = null; mesh?.sendEvent({ type: 'room', ...current(), t: state.t }); };

export const current = (): RoomSettings => ({ light: state.light, warmth: state.warmth, frost: state.frost });

export const roomControls = {
  get: current,
  // A change made on this device (wall panel).
  set(patch: Partial<RoomSettings>) {
    if (!apply(patch, Math.max(syncedNow(), state.t + 1))) return;
    if (Date.now() - lastSent >= BROADCAST_MS) send();
    else pending ??= setTimeout(send, BROADCAST_MS);
  },
  // The saved value from the server (page data); older than a live change it is ignored.
  load(saved: RoomSettings & { updatedAt: string }) { apply(saved, Date.parse(saved.updatedAt) || 1); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

let snapshot = current();
export function useRoomSettings(): RoomSettings {
  return useSyncExternalStore(roomControls.subscribe, () => {
    const c = current();
    if (c.light !== snapshot.light || c.warmth !== snapshot.warmth || c.frost !== snapshot.frost) snapshot = c;
    return snapshot;
  }, () => snapshot);
}

export function connectRoomControls(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => {
    if (msg.type === 'room' && valid(msg.light) && valid(msg.warmth) && valid(msg.frost) && typeof msg.t === 'number') {
      apply({ light: msg.light as number, warmth: msg.warmth as number, frost: msg.frost as number }, msg.t);
    }
  });
  // Late joiners catch up from whoever is already there.
  const offPeers = m.onPeers(() => setTimeout(() => { if (state.t > 0) send(); }, 1500));
  return () => { off(); offPeers(); if (pending) clearTimeout(pending); mesh = null; };
}
