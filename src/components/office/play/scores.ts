'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';

// Best scores of the arcade game. Each member's own best is kept in their browser and told to the others
// over the WebRTC events channel while they are in the office; the game room's TV shows the table.

const KEY = 'gc-arcade-best';
let scores: Record<string, number> = {};
let me = '';
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
const emit = () => { scores = { ...scores }; listeners.forEach((l) => l()); };

const readOwn = () => { try { return Math.max(0, Math.floor(Number(localStorage.getItem(KEY)) || 0)); } catch { return 0; } };

export const arcadeScores = {
  get: () => scores,
  best: () => scores[me] ?? 0,
  /** Reports a finished round; returns true when it is this member's new best. */
  report(score: number) {
    if (!me || !(score > (scores[me] ?? 0))) return false;
    scores[me] = score;
    try { localStorage.setItem(KEY, String(score)); } catch { /* storage blocked */ }
    mesh?.sendEvent({ type: 'score', score });
    emit();
    return true;
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useArcadeScores = () => useSyncExternalStore(arcadeScores.subscribe, arcadeScores.get, arcadeScores.get);

export function connectScores(m: Mesh | null, userId: string) {
  mesh = m; me = userId;
  const own = readOwn();
  if (own > (scores[me] ?? 0)) { scores[me] = own; emit(); }
  if (!m) return () => {};
  const off = m.onEvent((from, msg) => {
    if (msg.type !== 'score' || typeof msg.score !== 'number' || !(msg.score >= 0) || msg.score > 100000) return;
    if (Math.floor(msg.score) > (scores[from.userId] ?? 0)) { scores[from.userId] = Math.floor(msg.score); emit(); }
  });
  const offPeers = m.onPeers(() => setTimeout(() => { if (scores[me]) m.sendEvent({ type: 'score', score: scores[me] }); }, 1200));
  return () => { off(); offPeers(); mesh = null; };
}
