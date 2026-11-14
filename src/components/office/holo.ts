'use client';
import { useSyncExternalStore } from 'react';

// How one's own smart screen stands (owner request: each member's hologram is their own — the others never
// see it — while it shows the same shared screen; it can be resized and turned, and an automatic button
// puts it right in front of where one is looking). Kept on this device only; nothing goes over the network.
//
// - Over the table (default): it floats over the middle of the table, always turned towards you, sized to
//   fit your screen (narrow on a phone held upright); the size buttons make it bigger or smaller from there.
// - Placed: after "Fit to my view" (or turning it), it stays where it was put, in front of your eyes,
//   facing you, filling most of your view; size and turning then change it there.

export interface HoloPlace { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; w: number }
export interface HoloView {
  scale: number; // the member's size choice (1 = automatic size)
  place: HoloPlace | null; // null: over the table, following the viewer
  turn: number; // turning still to apply (radians), taken by the scene on its next frame
  fit: number; // counts "fit to my view" presses; the scene places it when this changes
}

const KEY = 'gc-holo-scale';
export const HOLO_SCALE: [number, number] = [0.45, 2.6];
let view: HoloView = { scale: 1, place: null, turn: 0, fit: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const save = () => { try { localStorage.setItem(KEY, String(view.scale)); } catch { /* storage blocked */ } };

export const holoView = {
  get: () => view,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  load() {
    try { const v = Number(localStorage.getItem(KEY)); if (v >= HOLO_SCALE[0] && v <= HOLO_SCALE[1]) view = { ...view, scale: v }; } catch { /* storage blocked */ }
    emit();
  },
  /** Bigger (k > 1) or smaller. */
  grow(k: number) {
    view = { ...view, scale: Math.min(HOLO_SCALE[1], Math.max(HOLO_SCALE[0], view.scale * k)) };
    save(); emit();
  },
  /** Turns it around the upright axis (it stays where it is from then on). */
  turn(rad: number) { view = { ...view, turn: view.turn + rad }; emit(); },
  /** Right in front of where one is looking, facing one, as large as fits the view. */
  fit() { view = { ...view, fit: view.fit + 1, scale: 1, turn: 0 }; save(); emit(); },
  /** Back over the middle of the table. */
  overTable() { view = { ...view, place: null, turn: 0 }; emit(); },
  /** The scene records where it stands now (after placing or turning it). */
  placed(place: HoloPlace | null) { view = { ...view, place, turn: 0 }; emit(); },
};

export const useHoloView = () => useSyncExternalStore(holoView.subscribe, holoView.get, holoView.get);
