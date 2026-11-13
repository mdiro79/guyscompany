'use client';
import { useSyncExternalStore } from 'react';
import type { GameId } from '@/lib/arcade';

// Which part of the arcade is on screen. Kept outside React so the office (a cabinet, an invitation)
// can open a game directly.
export type HubTab = 'versus' | 'solo' | 'league';
let state: { game: GameId | null; tab: HubTab } = { game: null, tab: 'versus' };
const listeners = new Set<() => void>();
export const arcadeView = {
  get: () => state,
  set(patch: Partial<typeof state>) { state = { ...state, ...patch }; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useArcadeView = () => useSyncExternalStore(arcadeView.subscribe, arcadeView.get, arcadeView.get);
