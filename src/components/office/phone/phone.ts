'use client';
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GESTURE_MS, type GestureId } from './gestures';

// The office phone every member carries (owner request): the site's sections as apps, a camera with a
// rear and a selfie lens (zoom, ultra-wide, wide photos, poses, everyone in the picture looking at the
// lens) and a gallery. This holds what the phone shows and the camera settings (on this device), and what
// the 3D scene needs from it: where the phone's camera is and photos waiting to be taken.

export type PhoneApp = 'home' | 'camera' | 'gallery' | 'web';
export type Lens = 'rear' | 'selfie';
export type SelfieAngle = 'high' | 'level';
export type Aspect = 'tall' | 'wide'; // 3:4 portrait or 16:9 wide photo
export interface PhoneState {
  open: boolean; app: PhoneApp; web: string | null; // the site page an app shows
  lens: Lens; zoom: number; angle: SelfieAngle; stick: number; aspect: Aspect; grid: boolean; timer: 0 | 3 | 10;
}
export const ZOOMS = { rear: [0.5, 1, 2, 5], selfie: [0.6, 1] } as const;
export const STICK: [number, number] = [0.7, 2.4]; // selfie distance in metres (arm's length … selfie stick)

let state: PhoneState = { open: false, app: 'home', web: null, lens: 'rear', zoom: 1, angle: 'high', stick: 1.25, aspect: 'tall', grid: false, timer: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const phone = {
  get: () => state,
  set(patch: Partial<PhoneState>) { state = { ...state, ...patch }; emit(); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  toggle() { state = { ...state, open: !state.open, app: state.open ? state.app : state.app }; emit(); },
};
export const usePhone = () => useSyncExternalStore(phone.subscribe, phone.get, phone.get);

// ——— For the 3D scene ———
/** Where the phone's camera is while the camera app is open (heads in the picture turn to it). */
export const phoneCam = { active: false, selfie: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), fov: 60 };
/** Whether a point (a head) is in the phone camera's picture, roughly: in front of it, within its view, not too far. */
export function inPhoneView(p: THREE.Vector3) {
  if (!phoneCam.active) return false;
  const dx = p.x - phoneCam.pos.x, dy = p.y - phoneCam.pos.y, dz = p.z - phoneCam.pos.z, d = Math.hypot(dx, dy, dz);
  if (d < 0.2 || d > 9) return false;
  const cos = (dx * phoneCam.dir.x + dy * phoneCam.dir.y + dz * phoneCam.dir.z) / d;
  return cos > Math.cos(THREE.MathUtils.degToRad(phoneCam.fov * 0.75));
}
const lookTarget = new THREE.Vector3();
/** For CharacterModel's `lookAt`: the phone camera's place when the head at `head` is in the picture. */
export function phoneLook(head: THREE.Vector3 | null) {
  if (!head || !inPhoneView(head)) return null;
  return lookTarget.copy(phoneCam.pos);
}

/** This member as the 3D scene shows them in a selfie (Player reports it, the self character uses it). */
export const me = { x: 0, z: 0, yaw: 0, seatId: null as string | null, moving: 0 };

/** The viewfinder canvas on the phone's screen (the scene paints the camera's picture on it). */
export const viewfinder: { canvas: HTMLCanvasElement | null } = { canvas: null };

export interface Shot { blob: Blob; width: number; height: number }
let pending: { resolve: (s: Shot | null) => void } | null = null;
/** Takes a photo with the current settings (the scene renders it on its next frame). */
export function takePhoto(): Promise<Shot | null> {
  return new Promise((resolve) => { pending?.resolve(null); pending = { resolve }; });
}
/** The scene picks up a waiting photo request. */
export function nextShot() { const p = pending; pending = null; return p; }

// ——— One's own pose (seen by everyone) ———
let myGesture: { id: GestureId; until: number } | null = null;
let sendGesture: ((id: GestureId) => void) | null = null;
export const gestures = {
  mine: () => (myGesture && Date.now() < myGesture.until ? myGesture.id : null),
  /** Strikes a pose for a few seconds (others see it too). */
  strike(id: GestureId) { myGesture = { id, until: Date.now() + GESTURE_MS }; sendGesture?.(id); emit(); },
  connect(fn: ((id: GestureId) => void) | null) { sendGesture = fn; },
};
