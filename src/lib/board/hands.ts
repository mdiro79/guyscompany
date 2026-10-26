'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';

// Raised hands in the conference room (seat tablet). Live over the WebRTC mesh only: the queue is in the
// order hands went up; a hand comes down when its owner lowers it, stands up or leaves.

const hands = new Map<string, number>(); // member → when the hand went up (synced time)
let me: string | null = null;
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
let queue: string[] = [];

function changed() {
  queue = [...hands.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  listeners.forEach((l) => l());
}

export function raiseHand(up: boolean) {
  if (!me || up === hands.has(me)) return;
  const t = syncedNow();
  if (up) hands.set(me, t); else hands.delete(me);
  mesh?.sendEvent({ type: 'hand', up, t });
  changed();
}
/** The presenter (or anyone) lowers a member's hand, e.g. after giving them the word. */
export function lowerHand(userId: string) {
  if (!hands.has(userId)) return;
  hands.delete(userId);
  mesh?.sendEvent({ type: 'hand', up: false, who: userId, t: syncedNow() });
  changed();
}
export const handUp = (userId: string) => hands.has(userId);

function onMessage(from: PeerInfo, msg: Record<string, unknown>) {
  if (msg.type !== 'hand') return;
  const who = typeof msg.who === 'string' ? msg.who : from.userId;
  // Anyone may lower a hand; only its owner raises it.
  if (msg.up === true && who === from.userId) hands.set(who, typeof msg.t === 'number' ? msg.t : syncedNow());
  else if (msg.up === false) hands.delete(who);
  else return;
  changed();
}

export function connectHands(m: Mesh | null, userId: string) {
  me = userId;
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent(onMessage);
  const offPeers = m.onPeers((peers) => {
    let gone = false;
    for (const id of hands.keys()) if (id !== me && !peers.some((p) => p.userId === id)) { hands.delete(id); gone = true; }
    if (gone) changed();
    // Late joiners learn that my hand is up.
    if (me && hands.has(me)) setTimeout(() => { if (me && hands.has(me)) m.sendEvent({ type: 'hand', up: true, t: hands.get(me) }); }, 1500);
  });
  return () => { off(); offPeers(); if (me && hands.has(me)) raiseHand(false); mesh = null; };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const subscribeHands = subscribe;
export const handQueue = () => queue;
/** Members with a raised hand, first raised first. */
export function useHands() {
  return useSyncExternalStore(subscribe, () => queue, () => queue);
}
