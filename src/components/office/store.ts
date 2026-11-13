'use client';
import { useSyncExternalStore } from 'react';
import type { EmoteId } from './emotes';

export type PanelMode = 'none' | 'monitor' | 'fullscreen';
// What E (or the phone action button) would do right now.
export type StationKind = 'arcade' | 'jukebox' | 'coffee' | 'board';
export type Interact = { kind: 'seat'; id: string } | { kind: 'door'; id: string; open: boolean; allowed: boolean } | { kind: 'guide' } | { kind: 'panel' } | { kind: 'station'; id: string; station: StationKind; game?: string };
// A panel over the office that takes the pointer: the arcade (its list or one game), the jukebox or the map.
export type Overlay = 'none' | 'arcade' | 'jukebox' | 'map';

export interface OfficeUiState {
  locked: boolean; // pointer lock active
  seatId: string | null;
  panel: PanelMode;
  emoteWheel: boolean;
  interact: Interact | null;
  currentSlot: number | null; // office the player stands in
  inConference: boolean;
  roomPanel: boolean; // the conference wall panel's controls are open
  board: 'none' | 'mine' | 'screen'; // drawing board open over the office: one's own, or the presenter's (view only)
  lowQuality: boolean;
  myEmote: { id: EmoteId; until: number } | null;
  tutorialStep: number | null;
  selectedUserId: string | null; // avatar whose message history is open
  chat: boolean; // the team chat panel is open
  overlay: Overlay;
  used: { station: StationKind; at: number } | null; // the station last used with E (the coffee machine reacts to it)
  area: string; // where the player is (reception, cafe, …)
}

let state: OfficeUiState = {
  locked: false, seatId: null, panel: 'none', emoteWheel: false, interact: null, currentSlot: null, inConference: false, roomPanel: false, board: 'none',
  lowQuality: false, myEmote: null, tutorialStep: null, selectedUserId: null, chat: false, overlay: 'none', used: null, area: 'reception',
};
const listeners = new Set<() => void>();

export const officeUi = {
  get: () => state,
  set(patch: Partial<OfficeUiState>) {
    // Called every frame by the player: nothing is allocated when nothing changed.
    let changed = false;
    for (const k in patch) if (!Object.is(state[k as keyof OfficeUiState], patch[k as keyof OfficeUiState])) { changed = true; break; }
    if (!changed) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useOfficeUi<T>(select: (s: OfficeUiState) => T): T {
  return useSyncExternalStore(officeUi.subscribe, () => select(state), () => select(state));
}

// Raw input shared by keyboard, mouse and the touch overlay (read every frame, never re-renders).
export const input = {
  forward: 0, right: 0, run: false,
  lookDX: 0, lookDY: 0,
  action: false, // edge-triggered by consumers
  lookAt: null as [number, number, number] | null, // turn the view smoothly towards this point (cancelled by looking around)
  moving: false, // set by the player controller
  teleport: null as { x: number; z: number; yaw: number } | null, // jump there on the next frame (the map)
};

// Asks for mouse look. Browsers refuse without a fresh click or key press (and after Esc for a moment);
// that is fine and must not surface as an error.
export function lockPointer(el: HTMLElement | null | undefined) {
  try { void (el?.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* refused */ }
}
