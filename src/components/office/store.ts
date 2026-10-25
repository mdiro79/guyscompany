'use client';
import { useSyncExternalStore } from 'react';
import type { EmoteId } from './emotes';

export type PanelMode = 'none' | 'monitor' | 'fullscreen';
// What E (or the phone action button) would do right now.
export type Interact = { kind: 'seat'; id: string } | { kind: 'door'; id: string; open: boolean; allowed: boolean } | { kind: 'guide' } | { kind: 'panel' };

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
}

let state: OfficeUiState = {
  locked: false, seatId: null, panel: 'none', emoteWheel: false, interact: null, currentSlot: null, inConference: false, roomPanel: false, board: 'none',
  lowQuality: false, myEmote: null, tutorialStep: null, selectedUserId: null,
};
const listeners = new Set<() => void>();

export const officeUi = {
  get: () => state,
  set(patch: Partial<OfficeUiState>) {
    const next = { ...state, ...patch };
    if (Object.keys(patch).every((k) => Object.is(state[k as keyof OfficeUiState], next[k as keyof OfficeUiState]))) return;
    state = next;
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
  moving: false, // set by the player controller
};
