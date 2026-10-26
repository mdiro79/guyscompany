'use client';
import { useSyncExternalStore } from 'react';
import type * as THREE from 'three';

// What floats above a character's head (name, speech bubble, emote stickers) is ordinary DOM drawn by the
// office page, so text (Persian included) stays sharp and selectable. The 3D scene registers where each
// head is, and LabelProjector places the elements after every frame at the head and at the size an
// object of that size would have at that distance: walking up to someone makes their bubble bigger the
// same way their face gets bigger; from far away it is small.

// World size of one CSS pixel of a label (a 300 px wide bubble is 0.9 m wide in the office).
export const METRES_PER_PX = 0.003;

export interface Anchor {
  root: THREE.Object3D; // the character's group (fallback when the model has no head bone)
  head: THREE.Object3D | null; // head bone, followed so the label stays on the head (sitting, walking)
  top: number; // metres from the head bone up to the top of the head
  talk: number; // voice level 0..1 (the line under the name)
  hidden: boolean;
}

export const anchors = new Map<string, Anchor>();
export const labelEls = new Map<string, HTMLElement>();

// Ref callback for a label's element (keyed like its anchor: a user id, or 'receptionist').
const refs = new Map<string, (el: HTMLElement | null) => void>();
export function labelRef(id: string) {
  let ref = refs.get(id);
  if (!ref) {
    ref = (el) => { if (el) labelEls.set(id, el); else labelEls.delete(id); };
    refs.set(id, ref);
  }
  return ref;
}

// Teammates currently drawn in the scene (fresh network pose), so the page renders their labels.
let present: string[] = [];
const presentListeners = new Set<() => void>();
const EMPTY: string[] = [];
export const presentPeople = {
  set(ids: string[]) {
    if (ids.join() === present.join()) return;
    present = ids;
    presentListeners.forEach((l) => l());
  },
  subscribe(l: () => void) { presentListeners.add(l); return () => { presentListeners.delete(l); }; },
};
export const usePresentPeople = () => useSyncExternalStore(presentPeople.subscribe, () => present, () => EMPTY);

// Bumped when an emote or typing state arrives, so the labels re-render.
let version = 0;
const versionListeners = new Set<() => void>();
export const labelsChanged = () => { version++; versionListeners.forEach((l) => l()); };
export const useLabelsVersion = () => useSyncExternalStore(
  (l) => { versionListeners.add(l); return () => { versionListeners.delete(l); }; },
  () => version, () => 0,
);

// Scale of a label at view depth `depth` (metres) for a camera with vertical field of view `fovDeg`
// and a viewport `height` CSS pixels tall: the on-screen size of METRES_PER_PX at that depth.
export const labelScale = (depth: number, fovDeg: number, height: number) =>
  (METRES_PER_PX * height) / (2 * depth * Math.tan((fovDeg * Math.PI) / 360));
